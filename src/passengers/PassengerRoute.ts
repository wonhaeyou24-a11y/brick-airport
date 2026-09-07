import type {
  GameState,
  PassengerData,
  PassengerState,
  Vec3,
} from "../core/GameState";
import {
  boardingPoint,
  gateApproach,
  type PassengerWaypoints,
} from "./waypoints";

/**
 * PassengerRoute — waypoint-based walk for one passenger.
 *
 * NOT pathfinding: a fixed ordered list of steps (state + target + dwell),
 * resolved once from the passenger's route type and its aircraft's assigned
 * gate. Pure logic — no Three.js. Writes position / state back onto the
 * referenced PassengerData; PassengerManager mirrors that onto the mesh.
 *
 * Gate position always comes from GameState.gates[].parkPosition, never a mesh
 * (spec §13, §19, §28).
 */

const ARRIVE_EPSILON = 0.08;
/** Seconds an ARRIVED passenger lingers before PassengerManager removes it. */
export const ARRIVED_LINGER = 3;

interface Step {
  state: PassengerState;
  target: Vec3 | null;
  dwell: number;
}

export class PassengerRoute {
  private steps: Step[] = [];
  private index = 0;
  private dwellTimer = 0;
  private atStep = false;
  /** Time spent in the terminal ARRIVED state, for culling. */
  arrivedTime = 0;

  constructor(
    private readonly data: PassengerData,
    private readonly state: GameState,
    private readonly waypoints: PassengerWaypoints,
  ) {
    this.build();
    this.applyStepState();
  }

  tick(deltaTime: number): void {
    const step = this.steps[this.index];
    if (!step) return;

    if (this.data.state === "ARRIVED") {
      this.arrivedTime += deltaTime;
      return;
    }
    if (this.data.state === "BOARDED") return;

    if (step.target && !this.atStep) {
      if (this.moveToward(step.target, deltaTime)) {
        this.atStep = true;
        this.dwellTimer = step.dwell;
        this.data.targetPosition = null;
      }
      return;
    }

    // At the step (or a step with no movement) — wait out the dwell.
    this.dwellTimer -= deltaTime;
    if (this.dwellTimer <= 0) this.advance();
  }

  // --------------------------------------------------------------- internals

  private advance(): void {
    if (this.index < this.steps.length - 1) {
      this.index += 1;
      this.atStep = false;
      this.applyStepState();
    }
  }

  private applyStepState(): void {
    const step = this.steps[this.index];
    if (step) this.data.state = step.state;
  }

  private moveToward(target: Vec3, deltaTime: number): boolean {
    const dx = target.x - this.data.position.x;
    const dz = target.z - this.data.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist <= ARRIVE_EPSILON) {
      this.data.position = { x: target.x, y: 0, z: target.z };
      return true;
    }

    const stepLen = Math.min(this.data.speed * deltaTime, dist);
    this.data.position = {
      x: this.data.position.x + (dx / dist) * stepLen,
      y: 0,
      z: this.data.position.z + (dz / dist) * stepLen,
    };
    this.data.targetPosition = { x: target.x, y: 0, z: target.z };
    return false;
  }

  private gateParkPosition(): Vec3 {
    const gate = this.data.gateId ? this.state.getGate(this.data.gateId) : null;
    return gate?.parkPosition ?? { x: 0, y: 0, z: 8 };
  }

  private build(): void {
    const wp = this.waypoints;
    const park = this.gateParkPosition();

    if (this.data.routeType === "DEPARTURE") {
      this.steps = [
        { state: "TO_TERMINAL", target: wp.terminalEntrance, dwell: 0.2 },
        { state: "CHECK_IN", target: wp.checkIn, dwell: 1.5 },
        { state: "TO_GATE", target: wp.security, dwell: 0.2 },
        { state: "TO_GATE", target: gateApproach(park), dwell: 0.2 },
        { state: "BOARDING", target: boardingPoint(park), dwell: 1.2 },
        { state: "BOARDED", target: null, dwell: 0 },
      ];
    } else {
      this.steps = [
        { state: "DISEMBARKING", target: boardingPoint(park), dwell: 0.6 },
        {
          state: "TO_TERMINAL_AFTER_ARRIVAL",
          target: gateApproach(park),
          dwell: 0.2,
        },
        {
          state: "TO_TERMINAL_AFTER_ARRIVAL",
          target: wp.terminalEntrance,
          dwell: 0.2,
        },
        {
          state: "TO_TERMINAL_AFTER_ARRIVAL",
          target: wp.arrivalArea,
          dwell: 0.2,
        },
        { state: "ARRIVED", target: null, dwell: 0 },
      ];
    }
  }
}
