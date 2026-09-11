import type { GameState, MissionData, MissionType } from "../core/GameState";
import {
  MAX_ACTIVE_MISSIONS,
  MISSION_POOL,
  missionDescription,
} from "./MissionConfig";

/** What Game must act on after a mission tick. */
export interface MissionTick {
  /** Short strings for the HUD notice system (spec §E.3). */
  notices: string[];
}

export interface MissionHooks {
  /** Credit the balance (not ticket revenue) — Economy.grantReward. */
  grantMoney(amount: number): void;
  /** Bump reputation via the existing operations system — OperationsManager.grantReputation. */
  grantReputation(amount: number): void;
}

/**
 * MissionManager — the player-objective loop (V1.0-B).
 *
 * Pure game logic, no Three.js. It materialises the fixed pool once, keeps up
 * to MAX_ACTIVE_MISSIONS ACTIVE, reads progress straight from the existing
 * GameState counters (never a duplicate stat — spec §3, §D), and pays each
 * reward exactly once via GameState.completeMission's state guard (spec §12).
 *
 * Progress is only recomputed when a tracked counter actually changes
 * (signature-gated — spec §A.8, §10).
 */
export class MissionManager {
  private seeded = false;
  private lastSig = "";
  /** Belt-and-braces reward guard on top of completeMission's state check. */
  private readonly rewarded = new Set<string>();

  constructor(
    private readonly state: GameState,
    private readonly hooks: MissionHooks,
  ) {}

  update(_deltaTime: number): MissionTick {
    const notices: string[] = [];
    this.seedPool();
    this.activateNext();

    const sig = this.progressSignature();
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.updateProgress();
      this.checkCompletion(notices);
    }
    return { notices };
  }

  // --------------------------------------------------------------- internals

  /** Create every pool mission once, all AVAILABLE. */
  private seedPool(): void {
    if (this.seeded || this.state.data.missions.length > 0) {
      this.seeded = true;
      return;
    }
    const now = Date.now();
    for (const tpl of MISSION_POOL) {
      const mission: MissionData = {
        id: this.state.nextMissionId(),
        type: tpl.type,
        title: tpl.title,
        description: missionDescription(tpl.type, tpl.target),
        state: "AVAILABLE",
        target: tpl.target,
        progress: 0,
        rewardMoney: tpl.rewardMoney,
        rewardReputation: tpl.rewardReputation,
        createdAt: now,
      };
      this.state.addMission(mission);
    }
    this.seeded = true;
  }

  /** Fill empty ACTIVE slots from the AVAILABLE queue, in pool order. */
  private activateNext(): void {
    let active = this.state.data.missions.filter(
      (m) => m.state === "ACTIVE",
    ).length;
    for (const m of this.state.data.missions) {
      if (active >= MAX_ACTIVE_MISSIONS) break;
      if (m.state !== "AVAILABLE") continue;
      m.state = "ACTIVE";
      m.startedAt = Date.now();
      active += 1;
    }
  }

  private updateProgress(): void {
    for (const m of this.state.data.missions) {
      if (m.state !== "ACTIVE") continue;
      m.progress = Math.min(this.currentValue(m.type), m.target);
    }
  }

  private checkCompletion(notices: string[]): void {
    for (const m of this.state.data.missions) {
      if (m.state !== "ACTIVE") continue;
      if (m.progress < m.target) continue;
      if (this.rewarded.has(m.id)) continue;

      if (this.state.completeMission(m.id)) {
        this.rewarded.add(m.id);
        this.hooks.grantMoney(m.rewardMoney);
        this.hooks.grantReputation(m.rewardReputation);
        notices.push(
          `🎯 Mission complete: ${m.title}  +$${m.rewardMoney.toLocaleString("en-US")} · +${m.rewardReputation} rep`,
        );
      }
    }
  }

  /** The live GameState counter a mission type tracks (spec §D). */
  private currentValue(type: MissionType): number {
    const a = this.state.airport;
    switch (type) {
      case "FLIGHT_TARGET":
        return a.totalFlights ?? 0;
      case "PASSENGER_TARGET":
        return a.totalPassengers ?? 0;
      case "REVENUE_TARGET":
        return a.totalRevenue ?? 0;
      case "BUILD_TARGET":
        return this.state.data.buildings.length;
      case "OPERATION_TARGET":
        return this.state.data.groundOperations.filter(
          (o) => o.state === "COMPLETED",
        ).length;
      case "STAFF_TARGET":
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
      a.totalFlights ?? 0,
      a.totalPassengers ?? 0,
      a.totalRevenue ?? 0,
      this.state.data.buildings.length,
      completedOps,
      this.state.data.staff.length,
    ].join("|");
  }
}
