import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2, Matrix2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const sphereDefinition: CostFunctionDefinition = {
  id: 'sphere',
  name: 'Sphere Function',
  shortName: 'Sphere',
  dimension: 2,
  evaluate: (x1: number, x2: number) => x1 * x1 + x2 * x2,
  gradient: (x1: number, x2: number): Vector2 => ({ x: 2 * x1, y: 2 * x2 }),
  hessian: (): Matrix2 => ({ m11: 2, m12: 0, m21: 0, m22: 2 }),
  domain: { x1Min: -5.12, x1Max: 5.12, x2Min: -5.12, x2Max: 5.12 },
  knownGlobalMinima: [
    { x1: 0, x2: 0, value: 0, type: 'global-minimum', hessianEigenvalues: [2, 2], gradientMagnitude: 0 },
  ],
  functionClass: 'convex',
  metadata: {
    description: 'Simple convex quadratic bowl. The most basic unimodal test function.',
    difficulty: 'Trivial',
    topologyNotes: 'Single global minimum at origin. Perfectly spherical contours. Ideal for testing basic convergence.',
  },
};

export class SphereFunction extends CostFunction {
  readonly definition = sphereDefinition;
}

globalRegistry.register(new SphereFunction());
export default SphereFunction;