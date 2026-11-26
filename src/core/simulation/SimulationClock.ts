import { DEFAULT_ITERATIONS_PER_SECOND, DEFAULT_LOGICAL_DELTA } from './types';

/**
 * Deterministic logical clock. The render loop feeds wall-clock delta time,
 * but only whole logical steps are consumed by the optimizer. Playback speed
 * changes pacing, never the sequence or mathematics of steps.
 */
export class SimulationClock {
  iteration = 0;
  simulationTime = 0;
  logicalDelta = DEFAULT_LOGICAL_DELTA;
  running = false;
  playbackSpeed = 1;
  iterationsPerSecond = DEFAULT_ITERATIONS_PER_SECOND;

  private accumulator = 0;

  constructor(logicalDelta = DEFAULT_LOGICAL_DELTA, iterationsPerSecond = DEFAULT_ITERATIONS_PER_SECOND) {
    this.logicalDelta = logicalDelta;
    this.iterationsPerSecond = iterationsPerSecond;
  }

  reset(): void {
    this.iteration = 0;
    this.simulationTime = 0;
    this.accumulator = 0;
    this.running = false;
  }

  /** Fractional progress toward the next logical step in [0, 1). */
  getProgress(): number {
    return Math.min(1, Math.max(0, this.accumulator));
  }

  resetProgress(): void {
    this.accumulator = 0;
  }

  /** Record one completed logical step and advance simulation time. */
  recordStep(): void {
    this.iteration++;
    this.simulationTime = this.iteration * this.logicalDelta;
  }

  /**
   * Add wall-clock time and return how many whole logical steps should run.
   * Caller must execute exactly that many steps.
   */
  addWallTime(deltaSeconds: number): number {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
    this.accumulator += deltaSeconds * this.playbackSpeed * this.iterationsPerSecond;
    const steps = Math.floor(this.accumulator);
    this.accumulator -= steps;
    return steps;
  }

  setPlaybackSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0) return;
    this.playbackSpeed = speed;
  }

  setLogicalDelta(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.logicalDelta = delta;
    this.simulationTime = this.iteration * this.logicalDelta;
  }
}
