import * as THREE from "three";
import type { GameState, GroundVehicleData, Vec3 } from "../core/GameState";
import { GroundVehicle } from "./GroundVehicle";
import {
  pathToDepot,
  pathToGate,
  serviceLanePoint,
  workPosition,
} from "./vehicleWaypoints";

/** Distance (world units) at which a vehicle counts as having reached a waypoint. */
const ARRIVE_EPSILON = 0.06;

/**
 * GroundVehicleManager — the ground service fleet (V0.8-B).
 *
 * Owns the vehicle meshes and drives their movement + state machine
 * (IDLE → MOVING → WORKING → RETURNING → IDLE) along simple depot ↔ gate
 * waypoint paths. GameState.groundVehicles is the source of truth; this class
 * writes position / state back onto it and mirrors that onto the meshes — no
 * per-frame Mesh allocation (perf rule 54).
 *
 * WHAT a vehicle does (which operation, when) is decided by
 * GroundOperationManager (V0.8-C), which calls dispatch() / recall() here.
 */
export class GroundVehicleManager {
  readonly group: THREE.Group;

  private readonly vehicles = new Map<string, GroundVehicle>();
  /** vehicleId -> remaining waypoints of the current path. */
  private readonly paths = new Map<string, Vec3[]>();

  constructor(private readonly state: GameState) {
    this.group = new THREE.Group();
    this.group.name = "ground-vehicles";
    for (const data of state.data.groundVehicles) this.addMesh(data);
  }

  /** Selectable vehicles, for the SelectionManager. */
  get selectables(): GroundVehicle[] {
    return [...this.vehicles.values()];
  }

  getById(id: string): GroundVehicle | undefined {
    return this.vehicles.get(id);
  }

  update(deltaTime: number): void {
    for (const data of this.state.data.groundVehicles) {
      if (!this.vehicles.has(data.id)) this.addMesh(data); // runtime additions
      this.stepMovement(data, deltaTime);
      this.advancePath(data);
    }
    for (const vehicle of this.vehicles.values()) {
      vehicle.syncFromData();
      vehicle.tickAnimation();
    }
  }

  /**
   * Send an idle vehicle out to work an operation at its gate. Returns false if
   * the vehicle is not idle or the operation / gate is missing.
   */
  dispatch(vehicleId: string, operationId: string): boolean {
    const vehicle = this.state.getGroundVehicle(vehicleId);
    if (!vehicle || vehicle.state !== "IDLE") return false;
    const op = this.state.getGroundOperation(operationId);
    const gate = op ? this.state.getGate(op.gateId) : undefined;
    if (!op || !gate) return false;

    vehicle.operationId = operationId;
    vehicle.state = "MOVING";
    this.startPath(vehicle, pathToGate(vehicle.homePosition, gate.parkPosition));
    return true;
  }

  /**
   * Send a vehicle that just finished a task straight to another gate for its
   * next task, skipping the depot round-trip (spec §54 — simple movement, not
   * routing). Returns false if the vehicle / operation / gate is missing.
   */
  redirect(vehicleId: string, operationId: string): boolean {
    const vehicle = this.state.getGroundVehicle(vehicleId);
    if (!vehicle) return false;
    const op = this.state.getGroundOperation(operationId);
    const gate = op ? this.state.getGate(op.gateId) : undefined;
    if (!op || !gate) return false;

    vehicle.operationId = operationId;
    vehicle.state = "MOVING";
    this.startPath(vehicle, [
      serviceLanePoint(vehicle.position.x),
      serviceLanePoint(gate.parkPosition.x),
      workPosition(gate.parkPosition),
    ]);
    return true;
  }

  /** Work is done — send the vehicle back to its depot slot. */
  recall(vehicleId: string): void {
    const vehicle = this.state.getGroundVehicle(vehicleId);
    if (!vehicle) return;
    const op = this.state.getGroundOperation(vehicle.operationId);
    const gate = op ? this.state.getGate(op.gateId) : undefined;
    const park = gate?.parkPosition ?? vehicle.homePosition;

    vehicle.operationId = null;
    vehicle.state = "RETURNING";
    this.startPath(vehicle, pathToDepot(vehicle.homePosition, park));
  }

  isAtWork(vehicleId: string): boolean {
    return this.state.getGroundVehicle(vehicleId)?.state === "WORKING";
  }

  isIdle(vehicleId: string): boolean {
    return this.state.getGroundVehicle(vehicleId)?.state === "IDLE";
  }

  dispose(): void {
    for (const vehicle of this.vehicles.values()) vehicle.dispose();
    this.vehicles.clear();
    this.paths.clear();
  }

  // --------------------------------------------------------------- internals

  private addMesh(data: GroundVehicleData): void {
    const vehicle = new GroundVehicle(data);
    this.vehicles.set(data.id, vehicle);
    this.group.add(vehicle.object);
  }

  private startPath(vehicle: GroundVehicleData, path: Vec3[]): void {
    this.paths.set(vehicle.id, path.slice());
    vehicle.targetPosition = path.length ? { ...path[0] } : null;
  }

  private stepMovement(data: GroundVehicleData, dt: number): void {
    const target = data.targetPosition;
    if (!target) return;

    const dx = target.x - data.position.x;
    const dz = target.z - data.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= ARRIVE_EPSILON) {
      data.position = { x: target.x, y: 0, z: target.z };
      data.targetPosition = null;
      return;
    }
    const step = Math.min(data.speed * dt, dist);
    data.position = {
      x: data.position.x + (dx / dist) * step,
      y: 0,
      z: data.position.z + (dz / dist) * step,
    };
  }

  private advancePath(data: GroundVehicleData): void {
    if (data.targetPosition) return; // still driving to the current waypoint
    const remaining = this.paths.get(data.id);
    if (!remaining) return;

    remaining.shift(); // drop the waypoint just reached
    if (remaining.length > 0) {
      data.targetPosition = { ...remaining[0] };
      return;
    }

    // Path finished.
    this.paths.delete(data.id);
    if (data.state === "MOVING") {
      data.state = "WORKING";
    } else if (data.state === "RETURNING") {
      data.state = "IDLE";
      data.position = { ...data.homePosition };
    }
  }
}
