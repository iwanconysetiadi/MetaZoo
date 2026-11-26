# METAZOO Phase 2 — Simulation Engine & Generic Optimization Agent Framework

## 1. Overview

Phase 2 adds a deterministic, world-agnostic simulation layer on top of the existing
Phase 1/1.5 optimization worlds. The engine drives pluggable optimizers against the
current `OptimizationWorld`, records telemetry and history, and renders candidates as
generic scientific markers. It does not rebuild Phase 1/1.5, add animals/species
animation, implement the full 20-algorithm zoo, or add race/leaderboard features.

Architecture:

```
OptimizationWorld
      ↓
EvaluationService  (only approved objective path, counted)
      ↓
Optimizer          (random-search | gradient-descent | test-swarm)
      ↓
SimulationEngine   (logical clock, budget, history, validation, stale handling)
      ↓
OptimizerState / RenderFrame
      ↓
GenericAgentRenderer (InstancedMesh + best marker + trails)
      ↓
Three.js scene
```

Key files:

| Area | Path |
| --- | --- |
| Simulation core | `src/core/simulation/` |
| Optimizers | `src/core/simulation/optimizers/` |
| Agent renderer | `src/rendering/GenericAgentRenderer.ts` |
| Simulation UI | `src/ui/SimulationUI.ts` |
| App wiring | `src/main.ts`, `index.html` |
| Tests | `tests/simulation.test.ts` |
| Screenshots | `screenshots/01_simulation_ready.png` … `screenshots/10_dynamic_world_simulation.png` |

## 2. Simulation Engine

`SimulationEngine` owns run lifecycle:

- Statuses: `READY`, `RUNNING`, `PAUSED`, `COMPLETED`, `FAILED`, `STALE`.
- Completion reasons: `max-iterations`, `max-evaluations`, `target-reached`,
  `manual-stop`, `algorithm-termination`.
- Controls: `initialize`, `play`, `pause`, `stepOnce`, `reset`, `scrubTo`,
  `returnToLive`, `startReplay`, `stopReplay`, `advance`.
- Introspection: state, displayed state, history, telemetry, evaluation count,
  bound world revision, run configuration, completion reason, error message.
- Serialization: `exportRunConfiguration()` emits JSON containing `runId`,
  `worldId`, `worldRevision`, optimizer id, seed, population, budgets, boundary
  policy, objective mode, clock settings, target, parameters, and creation time.

Stepping order per logical iteration:

1. World is at logical time `t`.
2. Optimizer evaluates through `EvaluationService` and proposes the next state.
3. Engine validates the raw optimizer state.
4. Engine clones/finalizes state, updates iteration and evaluation count,
   recomputes statistics and best candidate.
5. Snapshot is recorded in history; telemetry is appended.
6. World simulation time advances; listeners are notified.
7. Engine checks termination conditions.

Invalid optimizer output fails the run with an explicit message (missing/duplicate
ids, non-finite positions or fitness, missing active flags, malformed best, decreasing
evaluation count, or budget overrun).

## 3. Timing

- `SimulationClock` is the logical clock. It tracks iteration, simulation time,
  logical delta, iterations per second, playback speed, and a fractional accumulator.
- Defaults: `logicalDelta = 0.2`, `iterationsPerSecond = 5`.
- The render loop calls `engine.advance(deltaSeconds)`. Wall time is converted into
  whole logical steps; the optimizer is never stepped once per graphics frame.
- Wall deltas are capped (`MAX_WALL_STEP = 0.25`) to avoid catch-up bursts.
- Playback speed changes pacing only. For the same seed/config, the logical state
  after the same number of iterations is identical regardless of speed.
- Dynamic worlds advance on the logical timeline through `onWorldTimeChanged`.
  Terrain rebuilds are throttled (~150 ms) for performance; the logical world time
  itself advances exactly per iteration.

## 4. Optimizer Contract

```ts
interface Optimizer {
  readonly id: string;
  readonly name: string;
  readonly populationBased: boolean;
  readonly defaultPopulationSize: number;
  initialize(context: OptimizerContext): void;
  step(context: OptimizerContext): OptimizerStepResult;
  getState(): OptimizerState;
  reset(context: OptimizerContext): void;
  dispose?(): void;
}
```

`OptimizerContext` exposes the world, evaluation service, constraints, seeded random,
iteration/evaluation counters, budget, boundary policy, objective mode, domain,
shared initial population, parameters, simulation time and logical delta.

Reference optimizers:

- `random-search` — population-based reference; validates RNG, budget, rendering,
  telemetry and reset.
- `gradient-descent` — single-agent reference; validates world gradient access,
  trajectory rendering, local-minimum behavior and `N/A` diversity.
- `test-swarm` — generic attraction swarm, explicitly marked **ENGINE TEST**; not a
  production algorithm.

Candidate state is neutral (`CandidateState`, not “particle”) and supports `id`,
position/previous position, fitness/previous fitness, best position/fitness, optional
role/metadata, and an active flag.

## 5. Generic Agents

`GenericAgentRenderer` renders arbitrary `CandidateState[]` from `RenderFrame`:

- `InstancedMesh` spheres with per-instance colors (best gold, active cyan, inactive
  grey), max 256 instances; target workloads are 30–100 agents.
- Best marker: gold torus ring + core sphere (`◎` style).
- Trails: `LineSegments`, last 9 logical positions per stable candidate id.
- Visual-only interpolation between previous and current logical states.
- Agent picking via raycast; selected candidate is shown in an inspector.
- Positions are mapped through `world.projectAgentToTerrain`, so agents sit on the
  terrain surface without terrain collision or pathfinding.
- Logical and rendered state are separate: the renderer never mutates optimizer state.

## 6. Evaluation Service

`EvaluationService` is the only approved objective-evaluation path.

- Every call increments a counter.
- Budget is enforced here; exceeding it throws `EvaluationBudgetExceededError`.
- Supports `evaluateTrue`, `evaluateObserved`, and the configured `objectiveMode`.
- Returns true value, observed value, selected value, feasibility and violation.
- Constraints are queried through `ConstraintService`, never directly by algorithms.

The engine also validates that evaluation counts never decrease and never exceed the
configured budget.

## 7. Reproducibility

- `SeededRandom` (mulberry32) is mandatory for stochastic algorithm logic.
- Initial population is generated once per run from the seed and shared across
  algorithms; reset does not silently regenerate it unless the world revision changed.
- Reset restores the initial RNG state and replays the same sequence.
- Same seed + same config + same world revision produces the same logical states.
- `makeRunId` uses wall-clock/random only for a human-readable identity string; it does
  not influence algorithm mathematics.

## 8. Telemetry

Per-iteration telemetry records:

- iteration
- evaluations
- best fitness
- mean fitness
- worst fitness
- diversity (mean Euclidean distance to the candidate centroid)
- feasible ratio
- distance to world reference optimum (when available)

For a single candidate, diversity is reported as `0` internally and displayed as
`N/A` by the UI. The simulation panel includes a convergence chart (best/mean), a log
scale toggle, live metrics, and semantic event history.

## 9. History and Replay

- `SimulationHistory` stores bounded snapshots (default max 2000) with decimation that
  preserves the first and latest entries.
- The scrubber is playback only: it applies stored snapshots and never re-runs the
  optimizer or spends evaluation budget.
- `REPLAY` plays history forward without evaluating; `LATEST` returns to live state.
- Scrub/replay updates the displayed candidates, best marker and world time.

## 10. Boundary and Constraints

Boundary policies:

- `clamp`
- `reflect`
- `reject` / deterministic resample
- `wrap`

`resolvePosition` applies the boundary policy and, if the result is infeasible, tries
up to 16 deterministic resamples before returning the boundary-resolved fallback.
Feasibility/violation always come from `ConstraintService`.

## 11. World Compatibility

- Runs bind to the world revision at initialization.
- Any objective/domain/function/challenge/sculpt change bumps `worldRevision`.
- A changed world marks a running or paused run `STALE`; the UI shows a warning banner
  with `RESET SIMULATION`.
- Reset rebinds to the new revision and regenerates the initial population because the
  old population may be invalid for the new world.
- Dynamic worlds (moving optimum) are supported; simulation time is passed into world
  evaluation and terrain rebuilds.

## 12. UI

The simulation UI is integrated into the existing dock and design system:

- `Simulation` dock button + setup panel (optimizer, population, seed, budgets,
  boundary policy).
- Bottom-right control strip (play/pause, step, reset, metrics, speed).
- Run panel with controls, metrics, convergence chart, log toggle, scrubber,
  latest/replay, recent events, new-run and export-config actions.
- Candidate inspector opened by clicking an agent in the 3D scene.
- Stale-world banner.
- Hidden in presentation mode.

QA/deep-link parameters supported by `main.ts`:

```
?sim=<optimizer>&simseed=&simpop=&simevals=&simiter=&simboundary=
&simsteps=&simrun=&simscrub=&simreplay=&siminspect=&simpane=&simstale=
&challenge=moving-oasis
```

## 13. Performance

- Agent rendering uses `InstancedMesh`; no per-agent meshes.
- History is bounded and decimated.
- DOM updates for telemetry/UI are throttled (~8 Hz).
- Dynamic terrain rebuilds are throttled (~150 ms) while logical time advances exactly.
- Demo workload: 30–100 agents at 60 FPS render; logical updates default to 5/s.

## 14. Tests and Verification

- Test suite: **132 passed** across 6 files.
- New Phase 2 suite: **25 tests** in `tests/simulation.test.ts`.
- Coverage includes:
  - RNG determinism and state restore
  - boundary clamp/reflect/wrap/reject
  - constraint-aware resampling
  - evaluation counting and budget enforcement
  - true vs observed objective values
  - unknown optimizer rejection and registry contents
  - deterministic run for same seed/config
  - deterministic reset
  - playback-speed independence
  - iteration and evaluation completion
  - explicit manual stop
  - target-fitness completion
  - stale detection and reset recovery
  - single-agent diversity `N/A`
  - telemetry and history scrubbing
  - run configuration serialization
  - dynamic-world logical time
- `npx tsc --noEmit`: clean.
- `npm run build`: successful.
- `npm run lint`: 0 errors (warnings are pre-existing/unused-symbol warnings).

Commands:

```
npm run dev        # http://localhost:3000
npm test
npm run build
npm run preview    # http://localhost:4173
npm run lint
```

## 15. Screenshots

| File | What it shows |
| --- | --- |
| `01_simulation_ready.png` | Setup panel with optimizer, seed, budgets, boundary policy |
| `02_simulation_random_search.png` | Random search agents over Rastrigin |
| `03_simulation_gradient_descent.png` | Single-agent gradient descent, `N/A` diversity |
| `04_simulation_swarm.png` | Generic attraction swarm over Rosenbrock |
| `05_simulation_telemetry.png` | Metrics, convergence chart, event history |
| `06_simulation_agent_inspector.png` | Clicked candidate inspector |
| `07_simulation_history_scrubber.png` | Scrubbed history at iteration 20/100 |
| `08_simulation_completed.png` | Completed run with `MAX ITER` reason |
| `09_simulation_world_change_stale.png` | Stale-run banner after world change |
| `10_dynamic_world_simulation.png` | Swarm tracking a moving oasis |

Existing Phase 1/1.5 screenshots remain in the same directory.

## 16. ## 17. Phase 2 Addendum — Engine Hardening (partial)

## 17. Phase 2 Addendum — Engine Hardening

The following engine-only hardening has been added without changing the UI/UX:

- **Headless run API** — `SimulationEngine.runHeadless(world, setup)` runs a full
  simulation without Three.js, returning final state, telemetry, completion
  reason, evaluation count, iteration count, run metadata and a deterministic
  state hash.
- **Batch infrastructure** — `runBatch(world, configs)` supports repeated runs
  with different seeds/configurations (no comparison UI).
- **Capability declarations** — optimizers expose `getCapabilities()` and worlds
  expose `getCapabilities()`; compatibility is checked during initialization
  with `SUPPORTED`, `SUPPORTED_WITH_CAUTION`, and `UNSUPPORTED` levels.
- **Structured candidate roles** — `CandidateRole` supports `id`, `label`,
  `rank`, and metadata for future animal-inspired role systems.
- **Engine event bus** — `EventBus` decouples engine/optimizer events from the
  renderer; engine events include initialization, completion, failure, world
  revision change, and budget exhaustion.
- **Evaluation audit** — optional audit log records evaluation number, position,
  true/observed values, feasibility, source, and cache status. Cache is OFF by
  default and cache hits are tracked separately.
- **Checkpoint / resume** — versioned `Checkpoint` captures logical state,
  RNG state, evaluation count, clock, telemetry summary, and world time.
  `resumeFromCheckpoint()` restores deterministic continuation.
- **Run manager** — `RunManager` retains independent runs for a world.
- **Export helpers** — `exportTelemetryCsv`, `exportRunHistory`, and
  `exportRunBundle` produce config, telemetry CSV, and history JSON.
- **Candidate lifecycle** — engine detects created/activated/deactivated/
  reinitialized/removed candidates between logical states and publishes ordered
  events with `eventSequence`.
- **Optimizer event bus** — `optimizerEventBus` publishes optimizer/lifecycle
  events independent of rendering.
- **History strategies** — `FULL`, `INTERVAL`, `RING`, and `NONE` with
  configurable sampling interval.
- **Centroid/spread telemetry** — recorded for populations with `N > 1` and
  included in telemetry CSV export.
- **Tests** — headless determinism, checkpoint resume, capabilities, audit
  logging, event ordering, history strategies, and centroid telemetry are
  covered in `tests/simulation.test.ts`.

Not yet implemented from the addendum: variable-population stress paths,
advanced visualization layers, camera-follow modes, stagnation hooks, and the
full research UI. The simulation foundation is now ready for Phase 3 optimizer
plugins without further engine redesign.

## 18. Remaining Limitations


- Only reference optimizers are implemented; the full algorithm zoo and race mode are
  intentionally out of scope.
- Gradient/Hessian-style derivative sampling performed by an optimizer is not counted
  as an objective evaluation; only `EvaluationService` calls are budgeted.
- Trail rendering is capped at 9 logical positions per candidate.
- Dynamic terrain rebuilds are throttled, so visible terrain can trail logical time
  slightly at high playback speeds; the logical world time is always exact.
- Existing critical-point/oasis overlays can visually overlap simulation markers.
- The UI is optimized for desktop; the control strip and panel are responsive but not
  designed for touch-first use.


## Cool Sky World ? desktop presentation update

Desktop/web is the primary design target; visual QA uses 1920 x 1080.

- Shared visual tokens drive dark glass UI, cool blue sky, ivory clouds, jade terrain and mineral rock.
- CloudSystem supplies layered instanced clouds and quality presets; grass and underside detail also scale by quality.
- IslandPresentation contains rock masses, timber braces, roots, terraces, sparse gardens, debris and a small walkway/lantern composition. Camera > Advanced > Underside View inspects these details.
- The entire rectangular objective domain is mapped invertibly to the organic island through IslandProjection. All three view modes use the same mapping. Domain coordinates, objective values and optimizer state remain authoritative; distances in the rendered island are not Cartesian distances in the objective domain.
- The running-area boundary follows the mapped x1/x2 limits. Probe picking applies the inverse mapping, and gradient arrows use the projected direction.
- Waterfalls use sparse animated strands, wet outlets and soft mist. Sphere has one flow; other supported worlds have at most two.
- Agents use ivory/jade and muted gold. Trails retain five logical positions; Natural defaults to off, analysis defaults to short, and the run panel can override trails and show a separate best path.

Validation:

- 139 tests passed across seven project test files, including organic coordinate round trips, coastline limits and objective-value preservation.
- TypeScript and Vite production build passed. The existing single-bundle size warning remains.
- Desktop screenshots and renderer measurements: screenshots/sky-world/. qa-results.json records draw calls, triangles, instances, shadow size and observed headless FPS for each view.
- Sphere Natural / Balanced at 1920 x 1080: 53 draw calls, 170759 triangles, 311 cloud instances, 7000 grass instances, 1024 shadow map. Headless Chrome observed 60 FPS on this machine; this is not a general device-performance guarantee.
- No JavaScript exceptions or shader errors were recorded during the desktop scenarios.


### Desktop visual correction pass

The hero coastline now uses broad asymmetric lobes and recesses, shared by the inverse coordinate mapping and the simulation boundary. The rock body extends through several fractured layers to a lower tip, with four main hanging formations, seven secondary tongues and twelve sparse fragments in Balanced mode. Three principal root systems and two timber zones keep the underside primarily geological. Clouds are composed as overlapping clusters of 10-20 volumes, with a foreground bank, dense lower sea, uneven middle groups and high background groups. A wider waterfall source feeds three separate falling flows and fades into mist. The hero camera is offset and lowered to include the full rock silhouette and open sky. Sphere receives a greener sanctuary material; objective values remain unchanged.


## Desktop UI system refinement

The navigation now groups the contour monogram, METAZOO wordmark, world name and subtitle in one horizontal identity block. Header chrome shares one sans-serif scale, ivory text, dark glass surfaces and jade selection states. Classification remains in Function Profile. The telemetry HUD and dock share a bottom baseline, with contextual panels aligned above the dock.

- Consistent SVG icons, focus styles, keyboard switches, 300 ms tooltips and dark custom select menus.
- Atlas collection tabs, saved-world empty states, current-world selection and function-derived contour thumbnails.
- Dialog Escape handling, focus containment and focus restoration; one contextual panel at a time.
- Visual quality presets with resolution, normalization and vertical scale in Advanced settings.
- Compact Simulation controls, semantic lifecycle badges and a collapsed History & export section.
- Camera gives Cinematic Survey the primary action, followed by Overview / Orbit / Top, Focus optimum and a collapsed list of additional viewpoints.
- Probe retains x1, x2 and objective value in Natural, adding gradient, slope, curvature and basin in Scientific.
- Custom Function editor shows a live formatted expression with superscripts; formula evaluation is unchanged.
- Canvas click actions occur after mouse release with a six-pixel drag threshold; UI keyboard interaction does not trigger world shortcuts.

QA artifacts are in screenshots/ui-system/. Local headless Chrome checks cover 1920 x 1080, 1440 x 900 and 1280 x 720, including one-line identity, header separation, bottom alignment, Atlas, dropdowns, panel exclusivity, math preview, camera hierarchy, analysis modes and presentation. Existing unit suite: 139 tests passed. Production build passes, with the existing large single-bundle warning.


### Context panel anchoring revision

Dock panels now anchor above their actual trigger, with horizontal viewport clamping and resize-aware placement. Settings anchors below its header trigger. Simulation follows the same dock placement. Opening Probe enables inspection; closing it or switching tools disables inspection. The Probe panel keeps the three latest pinned readings, while hover values remain next to the cursor. Probe pin callbacks still feed the existing measurement tool. Escape restores focus to the originating control. No new automated tests were run for this interaction revision.


## Sphere: The Convex Sanctuary

Sphere now uses its own render-only sanctuary instead of the generic halo, tiny pond and cone-tree ring. The revised pool has a seven-unit radius (reduced from the initial thirteen-unit treatment following visual feedback), irregular weathered stone coping, moss patches, animated jade ripples and a low exact-center marker. Eight differently sized, crooked-trunk trees form unequal groups; one nineteen-unit ancestor pine, exposed roots, a tiny lantern and a bench establish scale. A staggered stone path leads toward the pool. Branches, roots and stone are merged; canopy clusters are instanced.

Shorter instanced grass extends over the broad lawn with a soft reduction toward the cliffs. A small coastal rill feeds the existing single waterfall; it does not draw an uphill river from the mathematically low center. The existing organic coastline, fractured underside, roots, debris, cloud sea and layered sky remain the main world composition. Distant islands now use fractured rock silhouettes; Sphere receives lighter foreground haze so vegetation remains readable.

Natural shows the complete sanctuary; Scientific retains environmental context with the existing contour treatment; Topographic hides trees and peripheral sanctuary props. Decoration never changes Sphere evaluation, optimization coordinates, simulation bounds or agent projection. Runtime checks confirm f(0,0)=0 and f(1,2)=5. The latest one-line desktop header is preserved.

Requested hero artifact: screenshots/sphere-sanctuary/01_sphere_convex_sanctuary_hero.png. Detail, Scientific and Topographic screenshots and runtime results are stored alongside it.

Validation for the Sphere revision: 141 tests passed across seven test files, production build passed (existing bundle-size warning), and the three scene views recorded no JavaScript exceptions in local headless Chrome.


### Shared oasis treatment across other worlds

Non-Sphere worlds now use jade ripple water, irregular weathered stone coping, moss patches and unequal clusters of crooked-trunk trees. The generic halo discs and cone-tree ring have been removed. Radius adapts to the local sampled height variation and nearest other global optimum; vegetation footprints reserve space between adjacent oases. Water follows the sampled terrain and triangles outside the x1/x2 domain are omitted. No objective samples or optimum coordinates are changed. The precise center marker is retained in all modes; Scientific reduces vegetation and Topographic removes it. Grass exclusions now follow every global optimum, including off-center and multiple optima. Sphere retains its separate sanctuary, ancestor pine, lantern, bench and path.

This change received a TypeScript compilation check; no new automated tests or browser verification were requested for this pass.
