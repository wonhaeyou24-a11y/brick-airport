import * as THREE from "three";
import type { BuildingData } from "../core/GameState";
import { disposeObject } from "../core/three-utils";
import {
  type Selectable,
  type SelectionKind,
  tagSelectable,
} from "../selection/Selectable";
import { setEmissiveHighlight, disposeHighlight } from "../selection/highlight";
import { footprintCenterToWorld } from "../world/Grid";
import { buildingLabel } from "./BuildingConfig";

/**
 * Building — base class for functional airport structures.
 *
 * Owns a THREE.Group positioned from grid data. Subclasses only supply
 * placeholder geometry in build(); game logic stays in GameState. This is the
 * seam where placeholder geometry is later swapped for brick-style models.
 */
export abstract class Building implements Selectable {
  readonly id: string;
  readonly selectionKind: SelectionKind = "BUILDING";
  readonly object: THREE.Group;
  protected readonly data: BuildingData;

  constructor(data: BuildingData) {
    this.data = data;
    this.id = data.id;

    this.object = new THREE.Group();
    this.object.name = data.id;
    this.object.position.copy(
      footprintCenterToWorld(
        data.cell.col,
        data.cell.row,
        data.size.cols,
        data.size.rows,
      ),
    );
    this.object.rotation.y = data.rotationY;

    this.build(this.object);
    tagSelectable(this.object, this);
  }

  /** Subclasses add placeholder meshes to `group` in local space. */
  protected abstract build(group: THREE.Group): void;

  setHighlighted(highlighted: boolean): void {
    setEmissiveHighlight(this.object, highlighted);
  }

  getSelectionLabel(): string {
    return buildingLabel(this.data.type);
  }

  dispose(): void {
    disposeHighlight(this.object);
    disposeObject(this.object);
  }
}
