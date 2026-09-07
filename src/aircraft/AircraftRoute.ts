import * as THREE from "three";
import type { Aircraft } from "./Aircraft";
import type { AircraftState, GameState } from "../core/GameState";

/**
 * AircraftRoute — the full operation cycle for one aircraft, as a small
 * leg-based state machine:
 *
 *   PARKED -> TAXIING (out) -> TAKEOFF -> FLYING -> LANDING
 *          -> TAXIING (in)  -> PARKED  -> repeat
 *
 * Each leg carries its own state, speed and waypoint list, so AircraftManager
 * never touches path coordinates (spec §14). Movement itself is delegated to
 * Aircraft (heading alignment, arrival). Gate <-> aircraft links are pure
 * GameState relationships: the gate is released on pushback and a fresh
 * AVAILABLE gate is claimed when taxiing in (spec §19, §20, §28).
 */

const TAXI_SPEED = 6;
const BASE_DWELL = 3;

const LEG_TAXI_OUT = 0;
const LEG_TAKEOFF = 1;
const LEG_FLYING = 2;
const LEG_LANDING = 3;
const LEG_TAXI_IN = 4;

type Phase = "DWELL" | "MOVING";

interface Leg {
  state: AircraftState;
  speed: number;
  points: THREE.Vector3[];
}

/** Holding circuit used when no gate is free on arrival ("go around"). */
const HOLD_POINTS: readonly [number, number, number][] = [
  [50, 14, 22],
  [50, 14, -22],
  [-12, 14, -30],
  [-30, 14, 12],
  [20, 14, 32],
];

export type RouteStart = "PARKED" | "ARRIVING";

export class AircraftRoute {
  private legs: Leg[] = [];
  private legIndex = 0;
  private wpIndex = 0;
  private phase: Phase = "DWELL";
  private dwellTimer: number;
  private readonly dwell: number;

  constructor(
    private readonly craft: Aircraft,
    private readonly state: GameState,
    /** Fleet index — staggers departures and spreads air routes. */
    private readonly flightIndex: number,
    /** "PARKED" = already at a gate (default); "ARRIVING" = inbound, airborne. */
    start: RouteStart = "PARKED",
  ) {
    this.dwell = BASE_DWELL + (flightIndex % 3) * 3;
    this.dwellTimer = this.dwell;
    if (start === "ARRIVING") this.startAsArrival();
  }

  /** Begin a scheduled arrival on the LANDING leg (spec §11, §12). */
  private startAsArrival(): void {
    const gate = this.craft.data.homeGateId
      ? this.state.getGate(this.craft.data.homeGateId)
      : null;
    const origin = gate
      ? new THREE.Vector3(gate.parkPosition.x, 0, gate.parkPosition.z)
      : new THREE.Vector3(1, 0, 7);
    this.legs = this.buildLegs(origin);
    this.enterLeg(LEG_LANDING);
  }

  tick(deltaTime: number): void {
    if (this.phase === "DWELL") {
      this.dwellTimer -= deltaTime;
      // Wait out the dwell AND (from V0.3) hold until every departure
      // passenger has boarded. areAircraftPassengersReady() returns true when
      // there are no passengers, so pre-passenger behaviour is unchanged.
      if (
        this.dwellTimer <= 0 &&
        this.state.areAircraftPassengersReady(this.craft.data.id)
      ) {
        this.beginDeparture();
      }
      return;
    }

    const arrived = this.craft.update(deltaTime);
    if (!arrived) return;

    this.wpIndex += 1;
    const leg = this.legs[this.legIndex];
    if (leg && this.wpIndex < leg.points.length) {
      this.craft.moveTo(leg.points[this.wpIndex]);
    } else {
      this.enterLeg(this.legIndex + 1);
    }
  }

  // ------------------------------------------------------------- transitions

  private beginDeparture(): void {
    const data = this.craft.data;

    // Release the gate we are leaving (spec §20).
    if (data.homeGateId) this.state.releaseGate(data.homeGateId);
    data.homeGateId = null;

    const origin = new THREE.Vector3(data.position.x, 0, data.position.z);
    this.legs = this.buildLegs(origin);
    this.enterLeg(LEG_TAXI_OUT);
  }

  private enterLeg(index: number): void {
    if (index >= this.legs.length) {
      this.arrive();
      return;
    }

    const leg = this.legs[index];

    if (index === LEG_TAXI_IN && !this.assignGate(leg)) {
      this.goAround();
      return;
    }

    const data = this.craft.data;
    data.state = leg.state;
    data.speed = leg.speed;
    this.legIndex = index;
    this.wpIndex = 0;
    this.phase = "MOVING";
    this.craft.moveTo(leg.points[0]);
  }

  private arrive(): void {
    const data = this.craft.data;
    data.state = "PARKED";
    data.speed = TAXI_SPEED;
    data.targetPosition = null;
    this.phase = "DWELL";
    this.dwellTimer = this.dwell;
    if (data.homeGateId) this.state.occupyGate(data.homeGateId, data.id);
  }

  /**
   * Pick the gate for the inbound taxi. Honours a gate already reserved for
   * this aircraft (a scheduled arrival — FlightScheduler set homeGateId +
   * occupied it); otherwise claims any AVAILABLE gate. Returns false if none.
   */
  private assignGate(taxiInLeg: Leg): boolean {
    const reserved = this.craft.data.homeGateId
      ? this.state.getGate(this.craft.data.homeGateId)
      : null;
    const gate =
      reserved && reserved.aircraftId === this.craft.data.id
        ? reserved
        : this.state.findAvailableGate();
    if (!gate) return false;

    this.state.occupyGate(gate.id, this.craft.data.id);
    this.craft.data.homeGateId = gate.id;

    const p = gate.parkPosition;
    taxiInLeg.points = [
      new THREE.Vector3(-4, 0, 2),
      new THREE.Vector3(p.x, 0, p.z - 3),
      new THREE.Vector3(p.x, p.y, p.z),
    ];
    return true;
  }

  private goAround(): void {
    const fly = this.legs[LEG_FLYING];
    fly.points = HOLD_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z));

    const data = this.craft.data;
    data.state = fly.state;
    data.speed = fly.speed;
    this.legIndex = LEG_FLYING;
    this.wpIndex = 0;
    this.phase = "MOVING";
    this.craft.moveTo(fly.points[0]);
  }

  // ------------------------------------------------------------------ legs

  private buildLegs(origin: THREE.Vector3): Leg[] {
    const off = (this.flightIndex % 3) * 8 - 4; // spread air routes a little
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    const legs: Leg[] = [];

    legs[LEG_TAXI_OUT] = {
      state: "TAXIING",
      speed: TAXI_SPEED,
      points: [v(origin.x, 0, origin.z - 3), v(-6, 0, 2), v(-16, 0, 0)],
    };

    legs[LEG_TAKEOFF] = {
      state: "TAKEOFF",
      speed: 13,
      points: [v(-4, 0, 0), v(12, 0, 0), v(24, 3.5, 0), v(40, 9, 0)],
    };

    legs[LEG_FLYING] = {
      state: "FLYING",
      speed: 17,
      points: [
        v(58, 14, 6 + off),
        v(60, 14, -34),
        v(20, 14, -50),
        v(-34, 14, -46),
        v(-58, 14, -6),
        v(-46, 14, 34 + off),
        v(6, 14, 50),
        v(50, 14, 26),
      ],
    };

    legs[LEG_LANDING] = {
      state: "LANDING",
      speed: 9,
      points: [v(40, 8, 6), v(24, 3, 0), v(10, 0.4, 0), v(-6, 0, 0)],
    };

    // Taxi-in waypoints are finalised in assignGate() once a gate is claimed.
    legs[LEG_TAXI_IN] = {
      state: "TAXIING",
      speed: TAXI_SPEED,
      points: [v(-4, 0, 2), v(origin.x, 0, origin.z - 3), v(origin.x, 0, origin.z)],
    };

    return legs;
  }
}
