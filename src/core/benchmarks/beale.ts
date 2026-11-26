import { CostFunction } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint, Vector2 } from '../math/Types';
import { globalRegistry } from '../math/CostFunction';

const bealeDefinition: CostFunctionDefinition = {
  id: 'beale',
  name: 'Beale Function',
  shortName: 'Beale',
  dimension: 2,
  evaluate: (x1: number, x2: number) => {
    const t1 = 1.5 - x1 + x1 * x2;
    const t2 = 2.25 - x1 + x1 * x2 * x2;
    const t3 = 2.625 - x1 + x1 * x2 * x2 * x2;
    return t1 * t1 + t2 * t2 + t3 * t3;
  },
  gradient: (x1: number, x2: number): Vector2 => {
    const t1 = 1.5 - x1 * (1 - x2);
    const t2 = 2.25 - x1 * (1 - x2 * x2);
    const t3 = 2.625 - x1 * (1 - x2 * x2 * x2);
    return {
      x: -2 * t1 * (1 - x2) - 2 * t2 * (1 - x2 * x2) - 2 * t3 * (1 - x2 * x2 * x2),
      y: 2 * t1 * x1 + 4 * t2 * x1 * x2 + 6 * t3 * x1 * x2 * x2,
    };
  },
  domain: { x1Min: -4.5, x1Max: 4.5, x2Min: -4.5, x2Max: 4.5 },
  knownGlobalMinima: [
    { x1: 3, x2: 0.5, value: 0, type: 'global-minimum', gradientMagnitude: 0 },
  ],
  functionClass: 'nonconvex',
  metadata: {
    description: 'Non-convex with a single global minimum at (3, 0.5). Narrow curved valley.',
    difficulty: 'Medium',
    topologyNotes: 'Sharp ridges and a narrow valley. Tests ability to navigate curved topology.',
  },
};

export class BealeFunction extends CostFunction {
  readonly definition = bealeDefinition;
}

globalRegistry.register(new BealeFunction());
export default BealeFunction;