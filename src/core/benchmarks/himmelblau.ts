import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2, Matrix2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const himmelblauDefinition: CostFunctionDefinition = {
  id: 'himmelblau',
  name: "Himmelblau's Function",
  shortName: 'Himmelblau',
  dimension: 2,
  evaluate: (x1: number, x2: number) => {
    const t1 = x1 * x1 + x2 - 11;
    const t2 = x1 + x2 * x2 - 7;
    return t1 * t1 + t2 * t2;
  },
  gradient: (x1: number, x2: number): Vector2 => {
    const t1 = x1 * x1 + x2 - 11;
    const t2 = x1 + x2 * x2 - 7;
    return {
      x: 4 * x1 * t1 + 2 * t2,
      y: 2 * t1 + 4 * x2 * t2,
    };
  },
  hessian: (x1: number, x2: number): Matrix2 => {
    const t1 = x1 * x1 + x2 - 11;
    const t2 = x1 + x2 * x2 - 7;
    return {
      m11: 4 * t1 + 8 * x1 * x1 + 2,
      m12: 4 * x1 + 4 * x2,
      m21: 4 * x1 + 4 * x2,
      m22: 2 + 4 * t2 + 8 * x2 * x2,
    };
  },
  domain: { x1Min: -6, x1Max: 6, x2Min: -6, x2Max: 6 },
  knownGlobalMinima: [
    { x1: 3, x2: 2, value: 0, type: 'global-minimum', gradientMagnitude: 0 },
    { x1: -2.805118086953, x2: 3.131312518251, value: 0, type: 'global-minimum', gradientMagnitude: 0 },
    { x1: -3.779310253378, x2: -3.283185991286, value: 0, type: 'global-minimum', gradientMagnitude: 0 },
    { x1: 3.584428340330, x2: -1.848126526964, value: 0, type: 'global-minimum', gradientMagnitude: 0 },
  ],
  functionClass: 'multimodal',
  metadata: {
    description: 'Four identical global minima. Excellent for testing multi-basin attraction visualization.',
    difficulty: 'Medium',
    topologyNotes: 'Four global minima at equal depth. One local maximum at (-0.270845, -0.923039) with value ~181.6. Several saddle points.',
  },
};

export class HimmelblauFunction extends CostFunction {
  readonly definition = himmelblauDefinition;
}

globalRegistry.register(new HimmelblauFunction());
export default HimmelblauFunction;