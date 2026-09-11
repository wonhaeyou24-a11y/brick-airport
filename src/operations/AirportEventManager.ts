import type { GameState } from "../core/GameState";
import { isFlightOver } from "../core/GameState";
import { OPERATIONS_CONFIG as C } from "./OperationsConfig";
import { cityLabel, eventDescription, eventTitle } from "../i18n/strings";

/**
 * AirportEventManager — small operating events (V0.7-E). Pure logic: no
 * Three.js, no HUD. It mutates GameState only for a FLIGHT_DELAY's effect and
 * otherwise just tracks active events + a cooldown; the caller (Operations
 * Manager / Game) turns the returned EventTick into HUD notices and extra
 * flight requests.
 *
 * Three event types to start (spec §37):
 *   FLIGHT_DELAY     — adds game-time to one in-progress flight (misses on-time,
 *                      hurts that flight's satisfaction). One-shot.
 *   PASSENGER_SURGE  — asks the scheduler for a few extra flights; aircraft
 *                      capacity is still respected (spec §42). One-shot.
 *   SERVICE_BONUS    — a temporary lift to service score + satisfaction (§43).
 *
 * Timing uses accumulated game-time (deltaTime), not wall-clock, so it behaves
 * under pumped-sim tests. First event no sooner than eventInitialDelay, then at
 * least eventCooldown apart (spec §40).
 */
export type AirportEventType =
  | "FLIGHT_DELAY"
  | "PASSENGER_SURGE"
  | "SERVICE_BONUS";

export interface AirportEvent {
  id: string;
  type: AirportEventType;
  title: string;
  description: string;
  /** Epoch ms the event started (display only). */
  startedAt: number;
  /** Seconds the event stays active (0 = one-shot, no lingering effect). */
  duration: number;
  /** Game-seconds since the event started. */
  elapsed: number;
  active: boolean;
}

export interface EventTick {
  /** Short strings for the HUD notice system (spec §50). */
  notices: string[];
  /** Extra flight requests to fire this frame (PASSENGER_SURGE). */
  extraFlightRequests: number;
  /** Whether a SERVICE_BONUS is currently active. */
  serviceBonusActive: boolean;
  /** True on the frame serviceBonusActive flipped (caller should recompute). */
  serviceBonusChanged: boolean;
}

const EVENT_ICON: Record<AirportEventType, string> = {
  FLIGHT_DELAY: "✈",
  PASSENGER_SURGE: "👥",
  SERVICE_BONUS: "⭐",
};

const EVENT_TYPES: readonly AirportEventType[] = [
  "FLIGHT_DELAY",
  "PASSENGER_SURGE",
  "SERVICE_BONUS",
];

export class AirportEventManager {
  private cooldown: number = C.eventInitialDelay;
  private active: AirportEvent[] = [];
  private seq = 0;
  private prevBonusActive = false;

  constructor(private readonly rand: () => number = Math.random) {}

  get activeEvents(): readonly AirportEvent[] {
    return this.active;
  }

  get serviceBonusActive(): boolean {
    return this.active.some((e) => e.type === "SERVICE_BONUS" && e.active);
  }

  update(deltaTime: number, state: GameState): EventTick {
    const notices: string[] = [];
    let extraFlightRequests = 0;

    // Age + expire lingering events.
    for (const e of this.active) {
      e.elapsed += deltaTime;
      if (e.duration > 0 && e.elapsed >= e.duration) e.active = false;
    }
    this.active = this.active.filter((e) => e.active);

    // Cooldown → maybe fire one.
    this.cooldown -= deltaTime;
    if (this.cooldown <= 0) {
      const event = this.startRandomEvent(state);
      if (event) {
        this.cooldown = C.eventCooldown;
        notices.push(`${EVENT_ICON[event.type]} ${event.title}`);
        if (event.type === "PASSENGER_SURGE") {
          extraFlightRequests = C.passengerSurgeFlights;
        }
      } else {
        // Nothing to act on (e.g. no flight to delay) — retry soon.
        this.cooldown = 10;
      }
    }

    const serviceBonusActive = this.serviceBonusActive;
    const serviceBonusChanged = serviceBonusActive !== this.prevBonusActive;
    this.prevBonusActive = serviceBonusActive;

    return {
      notices,
      extraFlightRequests,
      serviceBonusActive,
      serviceBonusChanged,
    };
  }

  private startRandomEvent(state: GameState): AirportEvent | null {
    const type = EVENT_TYPES[Math.floor(this.rand() * EVENT_TYPES.length)];

    if (type === "FLIGHT_DELAY") {
      const candidates = state.data.flights.filter(
        (f) => !isFlightOver(f.state) && f.state !== "SCHEDULED" && !f.delayed,
      );
      if (candidates.length === 0) return null;
      const flight =
        candidates[Math.floor(this.rand() * candidates.length)];
      flight.elapsedSeconds =
        (flight.elapsedSeconds ?? 0) + C.flightDelaySeconds;
      flight.delayed = true;
      return this.make(
        type,
        eventTitle(type, `Flight ${flight.id} delayed`),
        `${cityLabel(flight.origin)} → ${cityLabel(flight.destination)} ${flight.id} 출발이 지연되었습니다.`,
      );
    }

    if (type === "PASSENGER_SURGE") {
      return this.make(
        type,
        eventTitle(type, "Passenger surge!"),
        eventDescription(type, "A wave of extra travellers — more flights inbound."),
      );
    }

    return this.make(
      type,
      eventTitle(type, "Service bonus!"),
      eventDescription(type, "Staff are on top form — service and satisfaction lifted."),
    );
  }

  private make(
    type: AirportEventType,
    title: string,
    description: string,
  ): AirportEvent {
    const event: AirportEvent = {
      id: `evt-${++this.seq}`,
      type,
      title,
      description,
      startedAt: Date.now(),
      duration: C.eventDuration[type] ?? 0,
      elapsed: 0,
      active: true,
    };
    // One-shot events have no lingering state to track.
    if (event.duration > 0) this.active.push(event);
    return event;
  }
}
