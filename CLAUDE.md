# CLAUDE.md — Brick Airport

Original 3D airport simulation / building game with a colorful brick-toy aesthetic.

> **This is NOT a LEGO clone.** Do not use LEGO logos, copyrighted LEGO assets, or
> copied proprietary designs. The visual direction is an **original** colorful
> brick-toy world.

Project working name: **Brick Airport**

---

## 1. Core technology

- **Three.js** — 3D world: buildings, aircraft, vehicles, passengers, camera, animations, object interaction
- **TypeScript** — all game logic: state, airport/building/aircraft/passenger systems, economy, missions, save/load
- **Vite** — build & dev server
- **HTML / CSS** — HUD, menus, buttons, panels, responsive UI

**Do not** introduce React, Vue, or any other frontend framework unless explicitly requested.

---

## 2. Development philosophy

Develop in **stages**. Do **not** build the whole game at once.

Every stage:

1. Inspect the current project
2. Understand existing code
3. Make the smallest necessary changes
4. Implement the requested feature
5. Run TypeScript / build validation
6. Fix errors
7. Verify existing functionality still works
8. Summarize what changed

- Never rewrite the whole project unnecessarily.
- Never delete existing functionality just because another implementation is easier.
- Prefer **extending** existing systems over replacing them.
- Avoid large refactors unless explicitly requested.

---

## 3. Game / graphics separation

Game logic and visual representation stay **separated**.

| Game logic | Graphics |
|---|---|
| aircraft position & state, passenger count, airport money, building type & status | Three.js `Mesh`, materials, textures, models, animations |

Placeholder geometry must be replaceable with polished brick-style assets **without
rewriting game logic**. Do not tightly couple gameplay rules to individual Three.js meshes.

---

## 4. Game concept

The player builds and operates a small airport that gradually grows.

```
Airport → Buildings → Aircraft → Passengers → Airport operations
  → Income / rewards → Expansion → Missions → Larger airport
```

The initial airport is intentionally small and simple.

---

## 5. Visual direction

The whole world should feel like one cohesive **original** brick-toy universe —
buildings, terminal, runway surroundings, aircraft, vehicles, passengers,
decorations, trees, roads, signs, UI, animations.

- 3D isometric
- colorful brick / toy aesthetic
- clean airport architecture, bright brick colors
- white / gray airport structures
- adventurous, active city atmosphere
- cute but not childish, not overly babyish
- aircraft keep recognizable real-world proportions while looking toy / brick-built
- characters may be slightly cuter than the buildings

Do not copy specific LEGO sets or proprietary LEGO designs.

---

## 6. Camera

- isometric perspective
- no free camera rotation initially
- support zoom
- allow focus / zoom toward a selected object
- maintain an overall airport-management view

Implement the camera as an **independent module** (`camera/CameraController.ts`).

---

## 7. Building system

Eventual hybrid system:

- **Functional airport structures** — grid-based placement
- **Decorations** — free placement
- Buildings may eventually support simple block assembly

Do **not** implement complex construction mechanics in V0.1. First get reliable
building placement and object management working.

---

## 8. Responsive design

Eventually support:

- **PC** — landscape, larger management interface
- **Mobile** — portrait, touch-friendly controls, simplified UI

Do not assume desktop-only architecture. V0.1 still focuses on the core 3D world.

---

## 9. Target architecture

Modular layout (target, **not** a requirement to create every file up front —
create modules only when needed):

```
src/
├─ core/         Game.ts, GameLoop.ts, GameState.ts
├─ world/        AirportWorld.ts, Ground.ts, Grid.ts
├─ buildings/    Building.ts, Terminal.ts, Runway.ts, Gate.ts
├─ aircraft/     Aircraft.ts, AircraftManager.ts, AircraftRoute.ts
├─ passengers/   Passenger.ts, PassengerManager.ts
├─ vehicles/     Vehicle.ts, VehicleManager.ts
├─ construction/ BuildManager.ts, PlacementSystem.ts
├─ economy/      Economy.ts
├─ missions/     MissionManager.ts
├─ assets/       AssetManager.ts
├─ camera/       CameraController.ts
└─ ui/           HUD.ts, BuildMenu.ts, MissionPanel.ts
```

---

## 10. V0.1 development target

The first playable version is very small:

1. Three.js initialization
2. basic game loop
3. isometric camera
4. airport ground
5. runway
6. simple terminal building
7. one aircraft gate
8. placeholder aircraft
9. basic aircraft movement
10. basic object selection
11. basic responsive HTML/CSS HUD

Placeholder geometry is acceptable. Do not spend time on polished assets yet.
The purpose of V0.1 is to prove the core architecture works.

---

## 11. Future roadmap

| Version | Adds |
|---|---|
| V0.2 | aircraft landing/takeoff, routes, gate operation |
| V0.3 | passengers, movement, boarding, satisfaction |
| V0.4 | economy: income, expenses, rewards |
| V0.5 | building construction, grid placement, upgrades |
| V0.6 | airport vehicles, baggage, refueling, service vehicles |
| V0.7 | missions, objectives, progression |
| V0.8 | save/load, local persistence, game-state management |
| V0.9 | polished brick-style assets, animations, effects, sound |
| V1.0 | complete playable airport simulation |

---

## 12. Data-first design

Prefer structured game data. Three.js objects are **not** the source of truth.

```
Airport:  id, name, money, reputation, buildings, aircraft, passengers, missions
Building: id, type, position, rotation, level, status
Aircraft: id, type, position, destination, state
```

---

## 13. Save system

Architecture must eventually support save / load / reset / persistence.
No cloud backend in V0.1 — start with a clean game-state architecture that can
later back onto local storage and/or cloud storage.

---

## 14. Error prevention

After every meaningful change, run validation (`npm run build` or the project's
type-check/build command). Fix TypeScript errors before moving on. Never knowingly
leave the project in a broken build state.

---

## 15. Browser verification

When possible, verify in a browser:

- page loads
- Three.js canvas appears
- camera works
- airport objects appear
- no obvious console errors
- UI does not completely break at mobile size

---

## 16. Git development

Commit-friendly: small logical commits, e.g.

```
feat: create three.js airport world
feat: add runway and terminal
feat: add aircraft movement
feat: add airport camera controller
```

No giant commits containing unrelated changes.

---

## 17. Claude Code working rule

**Before changing code:** inspect the existing project, then briefly explain

- what currently exists
- what needs to change
- which files will be created/modified
- why

**Then implement.** Afterwards: run build/type checks, fix errors, summarize
changes, identify the next logical step.

Do not ask unnecessary questions. Ask only when a real design/product decision is required.

---

## 18. Product principle

The long-term goal is not "an airport with LEGO-looking objects." It is
**a complete original brick-toy airport simulation universe** — one coherent toy
world across WORLD, BUILDINGS, AIRCRAFT, VEHICLES, PEOPLE, DECORATIONS,
ANIMATIONS, and UI.
