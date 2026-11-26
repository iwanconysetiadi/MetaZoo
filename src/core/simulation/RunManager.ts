import { SimulationEngine } from './SimulationEngine';
import type { RunMetadata } from './types';
import type { RunSetup } from './SimulationEngine';
import type { OptimizationWorld } from '../world/OptimizationWorld';

export interface ManagedRun {
  metadata: RunMetadata;
  engine: SimulationEngine;
}

export class RunManager {
  private world: OptimizationWorld;
  private runs = new Map<string, ManagedRun>();

  constructor(world: OptimizationWorld) {
    this.world = world;
  }

  createRun(setup: RunSetup): ManagedRun {
    const engine = new SimulationEngine(this.world);
    engine.initialize(setup);
    const metadata = engine.getRunMetadata()!;
    const run = { metadata, engine };
    this.runs.set(metadata.runId, run);
    return run;
  }

  getRun(runId: string): ManagedRun | undefined {
    return this.runs.get(runId);
  }

  listRuns(): ManagedRun[] {
    return [...this.runs.values()];
  }

  removeRun(runId: string): void {
    const run = this.runs.get(runId);
    run?.engine.dispose();
    this.runs.delete(runId);
  }

  dispose(): void {
    for (const run of this.runs.values()) run.engine.dispose();
    this.runs.clear();
  }
}
