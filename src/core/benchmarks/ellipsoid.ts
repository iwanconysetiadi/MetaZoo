import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2, Matrix2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const ellipsoidDefinition: CostFunctionDefinition = {
  id: 'ellipsoid',
  name: 'Ellipsoid Function',
  shortName: 'Ellipsoid',
  dimension: 2,
  evaluate: (x1: number, x2: number) => x1 * x1 + 100 * x2 * x2,
  gradient: (x1: number, x2: number): Vector2 => ({ x: 2 * x1, y: 200 * x2 }),
  hessian: (): Matrix2 => ({ m11: 2, m12: 0, m21: 0, m22: 200 }),
  domain: { x1Min: -5.12, x1Max: 5.12, x2Min: -5.12, x2Max: 5.12 },
  knownGlobalMinima: [
    { x1: 0, x2: 0, value: 0, type: 'global-minimum', hessianEigenvalues: [2, 200], gradientMagnitude: 0 },
  ],
  functionClass: 'convex',
  metadata: {
    description: 'Ill-conditioned quadratic with elongated contours. Condition number = 100.',
    difficulty: 'Easy',
    topologyNotes: 'Narrow valley along x2 axis. Tests algorithm ability to handle ill-conditioning.',
  },
};

export class EllipsoidFunction extends CostFunction {
  readonly definition = ellipsoidDefinition;
}

globalRegistry.register(new EllipsoidFunction());
export default EllipsoidFunction;