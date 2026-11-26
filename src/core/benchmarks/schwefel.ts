import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const SCHWEFEL_OFFSET = 418.9829;
const SCHWEFEL_MIN_X = 420.96874636;
const SCHWEFEL_MIN_VALUE = SCHWEFEL_OFFSET * 2 - 2 * (SCHWEFEL_MIN_X * Math.sin(Math.sqrt(SCHWEFEL_MIN_X)));

const schwefelDefinition: CostFunctionDefinition = {
  id: 'schwefel',
  name: "Schwefel's Function",
  shortName: 'Schwefel',
  dimension: 2,
  evaluate: (x1: number, x2: number) => {
    const sum = x1 * Math.sin(Math.sqrt(Math.abs(x1))) + x2 * Math.sin(Math.sqrt(Math.abs(x2)));
    return SCHWEFEL_OFFSET * 2 - sum;
  },
  gradient: (x1: number, x2: number): Vector2 => {
    const g1 = Math.sin(Math.sqrt(Math.abs(x1))) + (x1 * Math.cos(Math.sqrt(Math.abs(x1))) / (2 * Math.sqrt(Math.abs(x1)))) * (x1 >= 0 ? 1 : -1);
    const g2 = Math.sin(Math.sqrt(Math.abs(x2))) + (x2 * Math.cos(Math.sqrt(Math.abs(x2))) / (2 * Math.sqrt(Math.abs(x2)))) * (x2 >= 0 ? 1 : -1);
    return { x: -g1, y: -g2 };
  },
  domain: { x1Min: -500, x1Max: 500, x2Min: -500, x2Max: 500 },
  knownGlobalMinima: [
    { x1: SCHWEFEL_MIN_X, x2: SCHWEFEL_MIN_X, value: SCHWEFEL_MIN_VALUE, type: 'global-minimum', gradientMagnitude: 0 },
  ],
  functionClass: 'multimodal',
  metadata: {
    description: 'Extremely multimodal with hundreds of local minima. Global minimum far from origin.',
    difficulty: 'Very Hard',
    topologyNotes: 'Global minimum at (~421, ~421). Many deep local minima near origin. Deceptive landscape.',
  },
};

export class SchwefelFunction extends CostFunction {
  readonly definition = schwefelDefinition;
}

globalRegistry.register(new SchwefelFunction());
export default SchwefelFunction;