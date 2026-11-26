import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2, Matrix2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const rosenbrockDefinition: CostFunctionDefinition = {
  id: 'rosenbrock',
  name: "Rosenbrock's Valley (Banana Function)",
  shortName: 'Rosenbrock',
  dimension: 2,
  evaluate: (x1: number, x2: number) => {
    const t1 = 1 - x1;
    const t2 = x2 - x1 * x1;
    return t1 * t1 + 100 * t2 * t2;
  },
  gradient: (x1: number, x2: number): Vector2 => {
    const t2 = x2 - x1 * x1;
    return {
      x: -2 * (1 - x1) - 400 * x1 * t2,
      y: 200 * t2,
    };
  },
  hessian: (x1: number, x2: number): Matrix2 => {
    return {
      m11: 2 - 400 * (x2 - 3 * x1 * x1),
      m12: -400 * x1,
      m21: -400 * x1,
      m22: 200,
    };
  },
  domain: { x1Min: -2.048, x1Max: 2.048, x2Min: -2.048, x2Max: 2.048 },
  knownGlobalMinima: [
    { x1: 1, x2: 1, value: 0, type: 'global-minimum', hessianEigenvalues: [2, 200], gradientMagnitude: 0 },
  ],
  functionClass: 'nonconvex',
  metadata: {
    description: 'Narrow, curved parabolic valley. Global minimum at (1,1) inside a long, flat valley.',
    difficulty: 'Very Hard',
    topologyNotes: 'Classic non-convex test. Valley floor follows x2 = x1^2. Gradient points across valley, not along it.',
  },
};

export class RosenbrockFunction extends CostFunction {
  readonly definition = rosenbrockDefinition;
}

globalRegistry.register(new RosenbrockFunction());
export default RosenbrockFunction;