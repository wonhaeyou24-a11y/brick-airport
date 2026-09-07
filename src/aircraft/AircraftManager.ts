import * as THREE from "three";
import { Aircraft } from "./Aircraft";
import { AircraftRoute } from "./AircraftRoute";
import type { GameState } from "../core/GameState";

/**
 * AircraftManager — owns Aircraft instances and ticks their routes.
 *
 * Fleet management only: creation, the selectable list, per-frame update,
 * teardown. Path + state-machine logic lives in AircraftRoute; aircraft
 * state/data lives in GameState. update(deltaTime) is driven from the loop.
 */
export class AircraftManager {
  readonly group: THREE.Group;
  private readonly aircraft: Aircraft[] = [];
  private readonly routes = new Map<string, AircraftRoute>();

  constructor(state: GameState) {
    this.group = new THREE.Group();
    this.group.name = "aircraft";

    state.data.aircraft.forEach((data, index) => {
      const craft = new Aircraft(data);
      this.aircraft.push(craft);
      this.group.add(craft.object);
      this.routes.set(craft.id, new AircraftRoute(craft, state, index));
    });
  }

  /** Selectable aircraft, for the SelectionManager. */
  get selectables(): Aircraft[] {
    return this.aircraft;
  }

  getById(id: string): Aircraft | undefined {
    return this.aircraft.find((a) => a.id === id);
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
}
