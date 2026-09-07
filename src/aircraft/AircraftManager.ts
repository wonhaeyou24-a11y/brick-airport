import * as THREE from "three";
import { Aircraft } from "./Aircraft";
import { AircraftRoute } from "./AircraftRoute";
import type { AircraftData, GameState } from "../core/GameState";

/**
 * AircraftManager — owns Aircraft instances and ticks their routes.
 *
 * Fleet management only: creation, the selectable list, per-frame update,
 * teardown. Path + state-machine logic lives in AircraftRoute; aircraft
 * state/data lives in GameState. Aircraft may be added at runtime by the
 * FlightScheduler via spawn().
 */
export class AircraftManager {
  readonly group: THREE.Group;
  private readonly aircraft: Aircraft[] = [];
  private readonly routes = new Map<string, AircraftRoute>();
  private created = 0;

  constructor(private readonly state: GameState) {
    this.group = new THREE.Group();
    this.group.name = "aircraft";

    for (const data of state.data.aircraft) this.add(data, "PARKED");
  }

  /** Selectable aircraft, for the SelectionManager. */
  get selectables(): Aircraft[] {
    return this.aircraft;
  }

  get count(): number {
    return this.aircraft.length;
  }

  getById(id: string): Aircraft | undefined {
    return this.aircraft.find((a) => a.id === id);
  }

  /** Add a scheduled arrival: it starts airborne on the LANDING leg. */
  spawn(data: AircraftData): Aircraft {
    return this.add(data, "ARRIVING");
  }

  update(deltaTime: number): void {
    for (const craft of this.aircraft) {
      this.routes.get(craft.id)?.tick(deltaTime);
    }
  }

  dispose(): void {
    for (const craft of this.aircraft) craft.dispose();
    this.aircraft.length = 0;
    this.routes.clear();
  }

  // --------------------------------------------------------------- internals

  private add(data: AircraftData, start: "PARKED" | "ARRIVING"): Aircraft {
    const craft = new Aircraft(data);
    this.aircraft.push(craft);
    this.group.add(craft.object);
    this.routes.set(
      craft.id,
      new AircraftRoute(craft, this.state, this.created++, start),
    );
    return craft;
  }
}
