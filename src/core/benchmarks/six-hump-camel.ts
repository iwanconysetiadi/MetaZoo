import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2, Matrix2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const sixHumpCamelDefinition: CostFunctionDefinition = {
  id: 'six-hump-camel',
  name: 'Six-Hump Camel Function',
  shortName: 'Six-Hump Camel',
  dimension: 2,
  evaluate: (x1: number, x2: number) => {
    const x1sq = x1 * x1;
    const x2sq = x2 * x2;
    return (4 - 2.1 * x1sq + (x1sq * x1sq) / 3) * x1sq + x1 * x2 + (-4 + 4 * x2sq) * x2sq;
  },
  gradient: (x1: number, x2: number): Vector2 => {
    const x1sq = x1 * x1;
    const x2sq = x2 * x2;
    return {
      x: (8 - 8.4 * x1sq + (4 * x1sq * x1sq) / 3) * x1 + x2,
      y: x1 + (-8 + 16 * x2sq) * x2,
    };
  },
  hessian: (x1: number, x2: number): Matrix2 => {
    const x1sq = x1 * x1;
    const x2sq = x2 * x2;
    return {
      m11: 8 - 25.2 * x1sq + (20 * x1sq * x1sq) / 3,
      m12: 1,
      m21: 1,
      m22: -8 + 48 * x2sq,
    };
  },
  domain: { x1Min: -3, x1Max: 3, x2Min: -2, x2Max: 2 },
  knownGlobalMinima: [
    { x1: 0.089842517519, x2: -0.712656433819, value: -1.031628453489, type: 'global-minimum', gradientMagnitude: 0 },
    { x1: -0.089842517519, x2: 0.712656433819, value: -1.031628453489, type: 'global-minimum', gradientMagnitude: 0 },
  ],
  knownLocalMinima: [
    { x1: -1.7036, x2: 0.7961, value: 2.104, type: 'local-minimum', gradientMagnitude: 0 },
    { x1: 1.7036, x2: -0.7961, value: 2.104, type: 'local-minimum', gradientMagnitude: 0 },
    { x1: -1.6071, x2: -0.5687, value: 6.178, type: 'local-minimum', gradientMagnitude: 0 },
    { x1: 1.6071, x2: 0.5687, value: 6.178, type: 'local-minimum', gradientMagnitude: 0 },
  ],
  functionClass: 'multimodal',
  metadata: {
    description: 'Six local minima (two global, four local). Highly multimodal with distinct basins.',
    difficulty: 'Hard',
    topologyNotes: 'Two global minima at (±0.09, ∓0.71) with value -1.0316. Four local minima at higher values.',
  },
};

export class SixHumpCamelFunction extends CostFunction {
  readonly definition = sixHumpCamelDefinition;
}

globalRegistry.register(new SixHumpCamelFunction());
export default SixHumpCamelFunction;