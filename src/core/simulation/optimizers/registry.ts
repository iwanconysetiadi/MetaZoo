import type { Optimizer, OptimizerDescriptor } from '../types';
import { RandomSearchOptimizer } from './RandomSearch';
import { GradientDescentOptimizer } from './GradientDescent';
import { TestSwarmOptimizer } from './TestSwarm';

type OptimizerFactory = () => Optimizer;

const FACTORIES: Record<string, OptimizerFactory> = {
  'random-search': () => new RandomSearchOptimizer(),
  'gradient-descent': () => new GradientDescentOptimizer(),
  'test-swarm': () => new TestSwarmOptimizer(),
};

export const OPTIMIZER_DESCRIPTORS: OptimizerDescriptor[] = [
  {
    id: 'random-search',
    name: 'Random Search',
    description: 'Independent uniform samples. Validates evaluation and budget accounting.',
    populationBased: true,
    defaultPopulationSize: 30,
  },
  {
    id: 'gradient-descent',
    name: 'Gradient Descent',
    description: 'Single-agent first-order descent. Validates gradients and trajectories.',
    populationBased: false,
    defaultPopulationSize: 1,
  },
  {
    id: 'test-swarm',
    name: 'Generic Attraction Swarm',
    description: 'ENGINE TEST. A minimal attraction swarm for population rendering.',
    populationBased: true,
    defaultPopulationSize: 30,
    engineTest: true,
  },
];

export function listOptimizerDescriptors(): OptimizerDescriptor[] {
  return OPTIMIZER_DESCRIPTORS.map(d => ({ ...d }));
}

export function createOptimizer(id: string): Optimizer | null {
  const factory = FACTORIES[id];
  return factory ? factory() : null;
}

export function getOptimizerDescriptor(id: string): OptimizerDescriptor | undefined {
  return OPTIMIZER_DESCRIPTORS.find(d => d.id === id);
}
