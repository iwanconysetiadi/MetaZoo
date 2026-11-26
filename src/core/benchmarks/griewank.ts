import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const griewankDefinition: CostFunctionDefinition = {
  id: 'griewank',
  name: "Griewank's Function",
  shortName: 'Griewank',
  dimension: 2,
  evaluate: (x1: number, x2: number) => {
    const sumSq = (x1 * x1 + x2 * x2) / 4000;
    const prodCos = Math.cos(x1 / Math.sqrt(1)) * Math.cos(x2 / Math.sqrt(2));
    return sumSq - prodCos + 1;
  },
  gradient: (x1: number, x2: number): Vector2 => {
    const prodCos = Math.cos(x1) * Math.cos(x2 / Math.sqrt(2));
    return {
      x: x1 / 2000 + Math.sin(x1) * Math.cos(x2 / Math.sqrt(2)),
      y: x2 / 2000 + (1 / Math.sqrt(2)) * Math.cos(x1) * Math.sin(x2 / Math.sqrt(2)),
    };
  },
  domain: { x1Min: -600, x1Max: 600, x2Min: -600, x2Max: 600 },
  knownGlobalMinima: [
    { x1: 0, x2: 0, value: 0, type: 'global-minimum', gradientMagnitude: 0 },
  ],
  functionClass: 'multimodal',
  metadata: {
    description: 'Many widespread local minima with a damped cosine product. Global minimum at origin.',
    difficulty: 'Hard',
    topologyNotes: 'Local minima become more frequent further from origin. Product term creates regular modulation.',
  },
};

export class GriewankFunction extends CostFunction {
  readonly definition = griewankDefinition;
}

globalRegistry.register(new GriewankFunction());
export default GriewankFunction;