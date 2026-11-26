import type { SimulationSnapshot } from './types';

/**
 * Bounded snapshot history. When the cap is reached the history is decimated
 * (every other snapshot kept) while always preserving the first and latest
 * entries. This keeps teaching-sized runs fully replayable without unbounded
 * memory growth on very long runs.
 */
export class SimulationHistory {
  private snapshots: SimulationSnapshot[] = [];
  private maxSnapshots: number;
  private stride = 1;

  constructor(maxSnapshots = 2000) {
    this.maxSnapshots = Math.max(2, Math.floor(maxSnapshots));
  }

  push(snapshot: SimulationSnapshot): void {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.decimate();
    }
  }

  private decimate(): void {
    const previous = this.snapshots;
    const kept: SimulationSnapshot[] = [];
    for (let i = 0; i < previous.length; i += 2) {
      kept.push(previous[i]);
    }
    const latest = previous[previous.length - 1];
    if (kept[kept.length - 1] !== latest) kept.push(latest);
    this.snapshots = kept;
    this.stride *= 2;
  }

  get size(): number {
    return this.snapshots.length;
  }

  get length(): number {
    return this.snapshots.length;
  }

  getStride(): number {
    return this.stride;
  }

  get(index: number): SimulationSnapshot | null {
    if (index < 0 || index >= this.snapshots.length) return null;
    return this.snapshots[index];
  }

  latest(): SimulationSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  getAll(): SimulationSnapshot[] {
    return this.snapshots;
  }

  clear(): void {
    this.snapshots = [];
    this.stride = 1;
  }
}
