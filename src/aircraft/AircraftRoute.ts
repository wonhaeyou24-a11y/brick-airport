import * as THREE from "three";
import type { Aircraft } from "./Aircraft";
import type { AircraftData, GameState } from "../core/GameState";

/** Seconds an aircraft waits at its gate before the next taxi loop. */
const GATE_DWELL = 4;

/**
 * AircraftRoute — a fixed looping taxi itinerary for one aircraft.
 *
 * Extracted from AircraftManager so path data lives apart from fleet
 * management (spec §10). Waypoints are relative to the aircraft's gate park
 * position, so this works regardless of where the gate is.
 *
 * Also keeps the gate <-> aircraft data link in sync: the gate is released
 * when the aircraft pushes back and re-occupied when it parks again. This is a
 * pure GameState relationship — no mesh parenting.
 *
 * State stays PARKED -> TAXIING -> PARKED for this stage; TAKEOFF / FLYING /
 * LANDING are already in the AircraftState union for later expansion.
 */
export class AircraftRoute {
  private readonly waypoints: THREE.Vector3[];
  private index = 0;
  private dwellTimer = GATE_DWELL;

  constructor(
    data: AircraftData,
    private readonly state: GameState,
  ) {
    const park = new THREE.Vector3(
      data.position.x,
      data.position.y,
      data.position.z,
    );
    // gate -> taxiway hold -> runway near end -> runway far end -> back
    this.waypoints = [
      park.clone().add(new THREE.Vector3(0, 0, -3)),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(-15, 0, 0),
      new THREE.Vector3(15, 0, 0),
      new THREE.Vector3(0, 0, 1),
      park.clone(),
    ];
  }

  tick(craft: Aircraft, deltaTime: number): void {
    const data = craft.data;

    if (data.state === "PARKED") {
      this.dwellTimer -= deltaTime;
      if (this.dwellTimer <= 0) {
        data.state = "TAXIING";
        this.index = 0;
        this.releaseGate(data);
        craft.moveTo(this.waypoints[0]);
      }
      return;
    }

    // TAXIING
    const arrived = craft.update(deltaTime);
    if (!arrived) return;

    this.index += 1;
    if (this.index >= this.waypoints.length) {
      data.state = "PARKED";
      this.dwellTimer = GATE_DWELL;
      this.occupyGate(data);
      return;
    }
    craft.moveTo(this.waypoints[this.index]);
  }

  private releaseGate(data: AircraftData): void {
    if (data.homeGateId) this.state.releaseGate(data.homeGateId);
  }

  private occupyGate(data: AircraftData): void {
    if (data.homeGateId) this.state.occupyGate(data.homeGateId, data.id);
  }
}
