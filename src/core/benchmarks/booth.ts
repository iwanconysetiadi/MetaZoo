import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2, Matrix2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const boothDefinition: CostFunctionDefinition = {
  id: 'booth',
  name: 'Booth Function',
  shortName: 'Booth',
  dimension: 2,
  evaluate: (x1: number, x2: number) => {
    const t1 = x1 + 2 * x2 - 7;
    const t2 = 2 * x1 + x2 - 5;
    return t1 * t1 + t2 * t2;
  },
  gradient: (x1: number, x2: number): Vector2 => {
    const t1 = x1 + 2 * x2 - 7;
    const t2 = 2 * x1 + x2 - 5;
    return {
      x: 2 * t1 + 4 * t2,
      y: 4 * t1 + 2 * t2,
    };
  },
  hessian: (): Matrix2 => ({ m11: 10, m12: 8, m21: 8, m22: 10 }),
  domain: { x1Min: -10, x1Max: 10, x2Min: -10, x2Max: 10 },
  knownGlobalMinima: [
    { x1: 1, x2: 3, value: 0, type: 'global-minimum', hessianEigenvalues: [2, 18], gradientMagnitude: 0 },
  ],
  functionClass: 'convex',
  metadata: {
    description: 'Simple convex quadratic. Single global minimum at (1,3).',
    difficulty: 'Trivial',
    topologyNotes: 'Elliptical contours. Good for testing basic gradient descent convergence.',
  },
};

export class BoothFunction extends CostFunction {
  readonly definition = boothDefinition;
}

globalRegistry.register(new BoothFunction());
export default BoothFunction;