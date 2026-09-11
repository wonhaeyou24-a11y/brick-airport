import type { GameState } from "../core/GameState";
import { facilityEffect, facilitySpeedFactor } from "../operations/AirportOperations";
import { getFacilityEffect } from "./FacilityConfig";

/** Aggregate facility effect across the whole airport (V1.1-B). */
export interface FacilityEffects {
  /** Sum of every building's passengerCapacity reference number. */
  passengerCapacity: number;
  /** Diminishing-returns sum of comfort across every service facility built. */
  comfort: number;
  /** Diminishing-returns sum of service across every service facility built. */
  service: number;
  /** Combined processing speed-up from Terminal/Check-in/Security/Baggage, 0-100%. */
  processing: number;
  /** The airport's current passenger satisfaction (pass-through, for convenience). */
  satisfaction: number;
}

const ZERO: FacilityEffects = {
  passengerCapacity: 0,
  comfort: 0,
  service: 0,
  processing: 0,
  satisfaction: 0,
};

/**
 * FacilityManager — turns "what buildings exist" into "what effect the
 * airport's facilities currently have" (V1.1-B). Pure logic, no Three.js.
 *
 * Recomputes only when the building list actually changes (a signature of
 * type + count), never per frame (spec §B.3) — matching the signature-gated
 * pattern already used across the HUD / mission / event managers.
 */
export class FacilityManager {
  private sig = "";
  private cached: FacilityEffects = ZERO;

  constructor(private readonly state: GameState) {}

  /** Call once per frame; cheap when nothing has been built/removed. */
  update(): void {
    const sig = this.state.data.buildings
      .map((b) => b.type)
      .sort()
      .join(",");
    if (sig === this.sig) return;
    this.sig = sig;
    this.cached = this.recompute();
  }

  getFacilityEffects(): FacilityEffects {
    return this.cached;
  }

  private recompute(): FacilityEffects {
    const counts = new Map<string, number>();
    for (const b of this.state.data.buildings) {
      counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
    }

    let passengerCapacity = 0;
    let comfort = 0;
    let service = 0;
    for (const [type, count] of counts) {
      const effect = getFacilityEffect(type as never);
      if (effect.passengerCapacity) {
        passengerCapacity += effect.passengerCapacity * count;
      }
      if (effect.comfort) comfort += facilityEffect(count, effect.comfort);
      if (effect.service) service += facilityEffect(count, effect.service);
    }

    // The three facility-sped processing steps, averaged into one % for the
    // HUD (spec §B.4/§B.5) — the real per-step multipliers still live in
    // PassengerRoute, this is just a display summary.
    const speedFactors = [
      facilitySpeedFactor(counts.get("TERMINAL") ?? 0),
      facilitySpeedFactor(counts.get("CHECK_IN") ?? 0),
      facilitySpeedFactor(counts.get("SECURITY") ?? 0),
      facilitySpeedFactor(counts.get("BAGGAGE") ?? 0),
    ];
    const meanFactor =
      speedFactors.reduce((sum, f) => sum + f, 0) / speedFactors.length;
    const processing = Math.round((1 - meanFactor) * 100);

    return {
      passengerCapacity,
      comfort: Math.round(comfort),
      service: Math.round(service),
      processing,
      satisfaction: Math.round(this.state.operations.passengerSatisfaction),
    };
  }
}
