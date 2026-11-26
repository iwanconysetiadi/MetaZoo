import { SimulationEngine } from './SimulationEngine';
import type { RunSetup } from './SimulationEngine';
import type { OptimizationWorld } from '../world/OptimizationWorld';
import type { HeadlessRunResult } from './types';

export function runBatch(
  world: OptimizationWorld,
  configs: RunSetup[],
): HeadlessRunResult[] {
  return configs.map(config => SimulationEngine.runHeadless(world, config));
}
