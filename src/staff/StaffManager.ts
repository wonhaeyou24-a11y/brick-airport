import * as THREE from "three";
import type { GameState, StaffData, Vec3 } from "../core/GameState";
import { Staff, disposeStaffResources } from "./Staff";
import { pathToGate, pathToRoom, staffLanePoint, staffWorkPosition } from "./staffWaypoints";

/** Distance (world units) at which a staff member counts as having reached a waypoint. */
const ARRIVE_EPSILON = 0.05;

/**
 * StaffManager — the airport workforce (V0.9-B).
 *
 * Owns the staff meshes and drives their movement + state machine
 * (IDLE → MOVING → WORKING → IDLE) along simple room ↔ gate walkway paths.
 * GameState.staff is the source of truth; this class writes position / state
 * back onto it and mirrors that onto the meshes — no per-frame Mesh allocation
 * (perf rule §8).
 *
 * WHAT a staff member does (which operation, when) is decided by
 * GroundOperationManager (V0.9-C/D), which calls assign() / recall() here.
 */
export class StaffManager {
  readonly group: THREE.Group;

  private readonly staff = new Map<string, Staff>();
  /** staffId -> remaining waypoints of the current walk. */
  private readonly paths = new Map<string, Vec3[]>();

  constructor(private readonly state: GameState) {
    this.group = new THREE.Group();
    this.group.name = "staff";
    for (const data of state.data.staff) this.addMesh(data);
  }

  /** Selectable staff, for the SelectionManager. */
  get selectables(): Staff[] {
    return [...this.staff.values()];
  }

  getById(id: string): Staff | undefined {
    return this.staff.get(id);
  }

  get count(): number {
    return this.state.data.staff.length;
  }

  /** Staff currently on a task (MOVING toward one, or WORKING). */
  get activeCount(): number {
    let n = 0;
    for (const s of this.state.data.staff) if (s.operationId) n += 1;
    return n;
  }

  update(deltaTime: number): void {
    for (const data of this.state.data.staff) {
      if (!this.staff.has(data.id)) this.addMesh(data); // runtime hires
      this.stepMovement(data, deltaTime);
      this.advancePath(data);
    }
    // Drop meshes for staff removed from state (not used in V0.9 — no firing).
    for (const [id, mesh] of this.staff) {
      if (!this.state.getStaff(id)) {
        mesh.dispose();
        this.staff.delete(id);
        this.paths.delete(id);
      }
    }
    for (const staff of this.staff.values()) {
      staff.syncFromData();
      staff.tickAnimation(deltaTime);
    }
  }

  /**
   * Send an idle staff member out to work an operation at its gate. Returns
   * false if the staff member is not idle or the operation / gate is missing.
   */
  assign(staffId: string, operationId: string): boolean {
    const staff = this.state.getStaff(staffId);
    if (!staff || staff.state !== "IDLE") return false;
    const op = this.state.getGroundOperation(operationId);
    const gate = op ? this.state.getGate(op.gateId) : undefined;
    if (!op || !gate) return false;

    staff.operationId = operationId;
    staff.state = "MOVING";
    this.startPath(staff, pathToGate(staff.homePosition, gate.parkPosition));
    return true;
  }

  /**
   * Send a staff member who just finished a task straight to another gate for
   * their next task, skipping the room round-trip (spec §C.4 — simple movement).
   */
  redirect(staffId: string, operationId: string): boolean {
    const staff = this.state.getStaff(staffId);
    if (!staff) return false;
    const op = this.state.getGroundOperation(operationId);
    const gate = op ? this.state.getGate(op.gateId) : undefined;
    if (!op || !gate) return false;

    staff.operationId = operationId;
    staff.state = "MOVING";
    this.startPath(staff, [
      staffLanePoint(staff.position.x),
      staffLanePoint(gate.parkPosition.x + 1.5),
      staffWorkPosition(gate.parkPosition),
    ]);
    return true;
  }

  /** Work is done — send the staff member back to the staff room. */
  recall(staffId: string): void {
    const staff = this.state.getStaff(staffId);
    if (!staff) return;
    const op = this.state.getGroundOperation(staff.operationId);
    const gate = op ? this.state.getGate(op.gateId) : undefined;
    const park = gate?.parkPosition ?? staff.homePosition;

    staff.operationId = null;
    staff.state = "MOVING";
    this.startPath(staff, pathToRoom(staff.homePosition, park));
  }

  isAtWork(staffId: string): boolean {
    return this.state.getStaff(staffId)?.state === "WORKING";
  }

  isIdle(staffId: string): boolean {
    return this.state.getStaff(staffId)?.state === "IDLE";
  }

  dispose(): void {
    for (const staff of this.staff.values()) staff.dispose();
    this.staff.clear();
    this.paths.clear();
    disposeStaffResources();
  }

  // --------------------------------------------------------------- internals

  private addMesh(data: StaffData): void {
    const staff = new Staff(data);
    this.staff.set(data.id, staff);
    this.group.add(staff.object);
  }

  private startPath(staff: StaffData, path: Vec3[]): void {
    this.paths.set(staff.id, path.slice());
    staff.targetPosition = path.length ? { ...path[0] } : null;
  }

  private stepMovement(data: StaffData, dt: number): void {
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

  private advancePath(data: StaffData): void {
    if (data.targetPosition) return; // still walking to the current waypoint
    const remaining = this.paths.get(data.id);
    if (!remaining) return;

    remaining.shift(); // drop the waypoint just reached
    if (remaining.length > 0) {
      data.targetPosition = { ...remaining[0] };
      return;
    }

    // Path finished. operationId presence tells us which trip this was.
    this.paths.delete(data.id);
    if (data.state === "MOVING") {
      if (data.operationId) {
        data.state = "WORKING";
      } else {
        data.state = "IDLE";
        data.position = { ...data.homePosition };
      }
    }
  }
}
