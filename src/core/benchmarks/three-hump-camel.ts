import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2, Matrix2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const threeHumpCamelDefinition: CostFunctionDefinition = {
  id: 'three-hump-camel',
  name: 'Three-Hump Camel Function',
  shortName: 'Three-Hump Camel',
  dimension: 2,
  evaluate: (x1: number, x2: number) => 2 * x1 * x1 - 1.05 * x1 * x1 * x1 * x1 + (x1 * x1 * x1 * x1 * x1 * x1) / 6 + x1 * x2 + x2 * x2,
  gradient: (x1: number, x2: number): Vector2 => ({
    x: 4 * x1 - 4.2 * x1 * x1 * x1 + x1 * x1 * x1 * x1 * x1 + x2,
    y: x1 + 2 * x2,
  }),
  hessian: (x1: number, x2: number): Matrix2 => ({
    m11: 4 - 12.6 * x1 * x1 + 5 * x1 * x1 * x1 * x1,
    m12: 1,
    m21: 1,
    m22: 2,
  }),
  domain: { x1Min: -5, x1Max: 5, x2Min: -5, x2Max: 5 },
  knownGlobalMinima: [
    { x1: 0, x2: 0, value: 0, type: 'global-minimum', gradientMagnitude: 0 },
  ],
  knownLocalMinima: [
    { x1: -1.7036, x2: 0.8518, value: -1.0316, type: 'local-minimum', gradientMagnitude: 0 },
    { x1: 1.7036, x2: -0.8518, value: -1.0316, type: 'local-minimum', gradientMagnitude: 0 },
  ],
  functionClass: 'multimodal',
  metadata: {
    description: 'Three local minima (one global, two local). Classic multimodal test with humps.',
    difficulty: 'Medium',
    topologyNotes: 'Global minimum at (0,0). Two symmetric local minima at (~±1.7, ~∓0.85) with value ~-1.03.',
  },
};

export class ThreeHumpCamelFunction extends CostFunction {
  readonly definition = threeHumpCamelDefinition;
}

globalRegistry.register(new ThreeHumpCamelFunction());
export default ThreeHumpCamelFunction;