import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2, Matrix2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const matyasDefinition: CostFunctionDefinition = {
  id: 'matyas',
  name: 'Matyas Function',
  shortName: 'Matyas',
  dimension: 2,
  evaluate: (x1: number, x2: number) => 0.26 * (x1 * x1 + x2 * x2) - 0.48 * x1 * x2,
  gradient: (x1: number, x2: number): Vector2 => ({ x: 0.52 * x1 - 0.48 * x2, y: 0.52 * x2 - 0.48 * x1 }),
  hessian: (): Matrix2 => ({ m11: 0.52, m12: -0.48, m21: -0.48, m22: 0.52 }),
  domain: { x1Min: -10, x1Max: 10, x2Min: -10, x2Max: 10 },
  knownGlobalMinima: [
    { x1: 0, x2: 0, value: 0, type: 'global-minimum', hessianEigenvalues: [0.04, 1.0], gradientMagnitude: 0 },
  ],
  functionClass: 'convex',
  metadata: {
    description: 'Simple convex quadratic with rotated elliptical contours.',
    difficulty: 'Trivial',
    topologyNotes: 'Condition number = 25. Rotated axes. Good for testing coordinate rotation invariance.',
  },
};

export class MatyasFunction extends CostFunction {
  readonly definition = matyasDefinition;
}

globalRegistry.register(new MatyasFunction());
export default MatyasFunction;