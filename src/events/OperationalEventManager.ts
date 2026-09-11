import type {
  GameState,
  OperationalEventData,
  OperationalEventType,
} from "../core/GameState";

/** What Game must act on after an operational-event tick. */
export interface OperationalEventTick {
  /** Short strings for the HUD notice system (spec §E.3). */
  notices: string[];
}

export interface OperationalEventHooks {
  /** Credit the balance (not ticket revenue) — Economy.grantReward. */
  grantMoney(amount: number): void;
  /** Bump reputation via the existing operations system — OperationsManager.grantReputation. */
  grantReputation(amount: number): void;
}

interface EventTemplate {
  type: OperationalEventType;
  title: string;
  description: string;
  /** How much the tracked counter must rise while the event is ACTIVE. */
  targetDelta: number;
  /** Game-seconds allowed to resolve it. */
  duration: number;
  rewardMoney: number;
  rewardReputation: number;
}

/**
 * The pool of operating events (spec §C). Every one is a POSITIVE prompt: keep
 * the airport moving and it resolves itself for a small bonus; ignore it and it
 * simply expires with no reward and no penalty. None of them stop, break, or
 * force any existing system (spec §6 — no failures / disasters).
 *
 * Each event tracks one existing GameState counter as a delta from its value
 * when the event began (`progress = current − baseline`).
 */
const EVENT_POOL: readonly EventTemplate[] = [
  {
    type: "PASSENGER_SURGE",
    title: "Passenger surge",
    description: "A wave of travellers has arrived — keep them moving.",
    targetDelta: 18,
    duration: 120,
    rewardMoney: 400,
    rewardReputation: 2,
  },
  {
    type: "FLIGHT_DEMAND",
    title: "High flight demand",
    description: "Airlines want more slots — turn a few more flights around.",
    targetDelta: 3,
    duration: 150,
    rewardMoney: 450,
    rewardReputation: 3,
  },
  {
    type: "GROUND_DELAY",
    title: "Ground crew backlog",
    description: "Turnarounds are piling up — clear the ground work.",
    targetDelta: 5,
    duration: 120,
    rewardMoney: 400,
    rewardReputation: 2,
  },
  {
    type: "MAINTENANCE_REQUEST",
    title: "Maintenance request",
    description: "A gate needs a check-over during its next turnarounds.",
    targetDelta: 3,
    duration: 110,
    rewardMoney: 350,
    rewardReputation: 2,
  },
  {
    type: "STAFF_SHORTAGE",
    title: "Staff shortage",
    description: "The roster is stretched — bring another crew member on.",
    targetDelta: 1,
    duration: 200,
    rewardMoney: 500,
    rewardReputation: 3,
  },
];

const EVENT_ICON: Record<OperationalEventType, string> = {
  PASSENGER_SURGE: "👥",
  FLIGHT_DEMAND: "✈",
  GROUND_DELAY: "🧰",
  MAINTENANCE_REQUEST: "🔧",
  STAFF_SHORTAGE: "🧑‍✈️",
};

/** No sooner than this after start / after the previous event (spec §C — ≥ 60s). */
const FIRST_EVENT_DELAY = 75;
const EVENT_INTERVAL = 95;
/** Retry sooner when the pool had nothing worth firing. */
const RETRY_DELAY = 15;

/**
 * OperationalEventManager — the operating-event loop (V1.0-C).
 *
 * Deliberately SEPARATE from the V0.7-E AirportEventManager flavour events
 * (spec §6): those are cosmetic and internal, these are player-facing
 * objectives stored in GameState.operationalEvents with progress + rewards.
 *
 * Pure game logic, no Three.js. Timing is accumulated game-time so it behaves
 * under pumped-sim tests. Rewards are paid exactly once per event, on RESOLVED
 * only — an EXPIRED event pays nothing (spec Test 14).
 */
export class OperationalEventManager {
  private cooldown = FIRST_EVENT_DELAY;
  private poolCursor = 0;
  private lastSig = "";
  /** Belt-and-braces reward guard on top of the ACTIVE-state check. */
  private readonly rewarded = new Set<string>();

  constructor(
    private readonly state: GameState,
    private readonly hooks: OperationalEventHooks,
  ) {}

  update(deltaTime: number): OperationalEventTick {
    const notices: string[] = [];

    this.ageActive(deltaTime, notices);

    this.cooldown -= deltaTime;
    if (this.cooldown <= 0) {
      const started = this.tryStartEvent();
      this.cooldown = started ? EVENT_INTERVAL : RETRY_DELAY;
      if (started) {
        notices.push(`${EVENT_ICON[started.type]} ${started.title} — ${started.description}`);
      }
    }

    const sig = this.progressSignature();
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.updateProgress(notices);
    }

    return { notices };
  }

  // --------------------------------------------------------------- internals

  private get activeEvents(): OperationalEventData[] {
    return this.state.data.operationalEvents.filter((e) => e.state === "ACTIVE");
  }

  /** Advance the clock on every ACTIVE event; expire the ones that ran out. */
  private ageActive(deltaTime: number, notices: string[]): void {
    for (const e of this.activeEvents) {
      e.elapsed += deltaTime;
      if (e.elapsed >= e.duration && e.progress < e.target) {
        e.state = "EXPIRED";
        notices.push(`${EVENT_ICON[e.type]} ${e.title} expired`);
      }
    }
  }

  /** Pick the next pool entry in rotation; skip ones that don't apply yet. */
  private tryStartEvent(): OperationalEventData | null {
    if (this.activeEvents.length > 0) return null;

    for (let i = 0; i < EVENT_POOL.length; i += 1) {
      const tpl = EVENT_POOL[(this.poolCursor + i) % EVENT_POOL.length];
      if (!this.eventApplies(tpl.type)) continue;
      this.poolCursor = (this.poolCursor + i + 1) % EVENT_POOL.length;
      return this.startEvent(tpl);
    }
    return null;
  }

  /** Guard rails so an event is only raised when the player can act on it. */
  private eventApplies(type: OperationalEventType): boolean {
    switch (type) {
      case "STAFF_SHORTAGE":
        // Only when the roster is genuinely thin and there is work to do.
        return (
          this.state.data.staff.length < 6 &&
          this.state.data.groundOperations.some(
            (o) => o.state === "PENDING" || o.state === "ASSIGNED",
          )
        );
      case "GROUND_DELAY":
      case "MAINTENANCE_REQUEST":
        // Needs at least one gate/turnaround pipeline to exist.
        return this.state.data.groundOperations.length > 0;
      default:
        return true;
    }
  }

  private startEvent(tpl: EventTemplate): OperationalEventData {
    const baseline = this.counterValue(tpl.type);
    const event: OperationalEventData = {
      id: this.state.nextOperationalEventId(),
      type: tpl.type,
      title: tpl.title,
      description: tpl.description,
      state: "ACTIVE",
      createdAt: Date.now(),
      duration: tpl.duration,
      elapsed: 0,
      target: tpl.targetDelta,
      progress: 0,
      baseline,
      rewardMoney: tpl.rewardMoney,
      rewardReputation: tpl.rewardReputation,
    };
    this.state.addOperationalEvent(event);
    return event;
  }

  private updateProgress(notices: string[]): void {
    for (const e of this.activeEvents) {
      const delta = this.counterValue(e.type) - e.baseline;
      e.progress = Math.max(0, Math.min(delta, e.target));
      if (e.progress >= e.target && !this.rewarded.has(e.id)) {
        e.state = "RESOLVED";
        this.rewarded.add(e.id);
        this.hooks.grantMoney(e.rewardMoney);
        this.hooks.grantReputation(e.rewardReputation);
        notices.push(
          `${EVENT_ICON[e.type]} ${e.title} resolved  +$${e.rewardMoney.toLocaleString("en-US")} · +${e.rewardReputation} rep`,
        );
      }
    }
  }

  /** The live GameState counter an event type tracks. */
  private counterValue(type: OperationalEventType): number {
    const a = this.state.airport;
    switch (type) {
      case "PASSENGER_SURGE":
        return a.totalPassengers ?? 0;
      case "FLIGHT_DEMAND":
        return a.totalFlights ?? 0;
      case "GROUND_DELAY":
      case "MAINTENANCE_REQUEST":
        return this.state.data.groundOperations.reduce(
          (n, o) => (o.state === "COMPLETED" ? n + 1 : n),
          0,
        );
      case "STAFF_SHORTAGE":
        return this.state.data.staff.length;
    }
  }

  private progressSignature(): string {
    const a = this.state.airport;
    const completedOps = this.state.data.groundOperations.reduce(
      (n, o) => (o.state === "COMPLETED" ? n + 1 : n),
      0,
    );
    return [
      a.totalPassengers ?? 0,
      a.totalFlights ?? 0,
      completedOps,
      this.state.data.staff.length,
    ].join("|");
  }
}
