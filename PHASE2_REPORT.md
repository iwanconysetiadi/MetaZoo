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
- **Tests** — headless determinism, checkpoint resume, capabilities, and audit
  logging are covered in `tests/simulation.test.ts`.

Not yet implemented from the addendum: variable-population stress paths, full
candidate lifecycle events, advanced visualization layers, camera-follow modes,
stagnation hooks, and the full research UI. The simulation foundation is now
ready for Phase 3 optimizer plugins without further engine redesign.

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
