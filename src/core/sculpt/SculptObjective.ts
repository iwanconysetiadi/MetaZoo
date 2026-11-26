import { CostFunction, globalRegistry } from '../math/CostFunction';
import { CostFunctionDefinition, CriticalPoint } from '../math/Types';
import { parseExpression } from '../expression';
import { SearchDomain, estimateOptimum } from '../custom/ReferenceOptimum';
import { CustomObjectiveDefinition } from '../custom/ChallengeObjective';

export type SculptFeatureKind = 'valley' | 'mountain' | 'basin' | 'ridge' | 'plateau';

export interface SculptFeature {
  id: string;
  kind: SculptFeatureKind;
  x1: number;
  x2: number;
  /** Signed amplitude: negative for valleys/basins, positive for mountains/ridges. */
  amplitude: number;
  sigmaX1: number;
  sigmaX2: number;
  rotation: number;
  /** Plateau edge softness (higher = flatter top). */
  softness?: number;
  enabled: boolean;
}

export type SculptBase =
  | { kind: 'blank' }
  | { kind: 'builtin'; id: string }
  | { kind: 'custom'; definition: CustomObjectiveDefinition };

export interface SculptWorldDefinition {
  schemaVersion: number;
  id: string;
  name: string;
  domain: SearchDomain;
  base: SculptBase;
  features: SculptFeature[];
  metadata?: { description?: string; tags?: string[] };
}

export const SCULPT_SCHEMA_VERSION = 1;
export const MAX_SCULPT_FEATURES = 32;

function featureValue(f: SculptFeature, x1: number, x2: number): number {
  let dx = x1 - f.x1;
  let dz = x2 - f.x2;
  if (f.rotation) {
    const c = Math.cos(f.rotation), s = Math.sin(f.rotation);
    const nx = c * dx - s * dz;
    const nz = s * dx + c * dz;
    dx = nx; dz = nz;
  }
  const sx = Math.max(1e-4, f.sigmaX1);
  const sz = Math.max(1e-4, f.sigmaX2);
  const q = (dx * dx) / (sx * sx) + (dz * dz) / (sz * sz);

  if (f.kind === 'plateau') {
    const p = Math.max(1, f.softness ?? 2);
    return f.amplitude * Math.exp(-Math.pow(q, p));
  }
  // valley / mountain / basin / ridge are smooth anisotropic Gaussians.
  return f.amplitude * Math.exp(-0.5 * q);
}

/** Compose base objective + enabled sculpt features into a pure evaluator. */
export function composeSculptEval(def: SculptWorldDefinition): (x1: number, x2: number) => number {
  const base = resolveBase(def);
  const features = def.features.filter(f => f.enabled);

  return (x1: number, x2: number) => {
    let v = base.eval(x1, x2);
    if (!isFinite(v)) return NaN;
    for (const f of features) v += featureValue(f, x1, x2);
    return v;
  };
}

function resolveBase(def: SculptWorldDefinition): { eval: (x1: number, x2: number) => number; name: string; known?: CriticalPoint[] } {
  if (def.base.kind === 'blank') {
    return { eval: () => 0, name: 'Blank World' };
  }
  if (def.base.kind === 'builtin') {
    const fn = globalRegistry.get(def.base.id);
    if (!fn) return { eval: () => 0, name: def.base.id };
    return { eval: (a, b) => fn.evaluate(a, b), name: fn.definition.shortName || fn.definition.name, known: fn.definition.knownGlobalMinima };
  }
  const parsed = parseExpression(def.base.definition.expression);
  return { eval: parsed.evaluate, name: def.base.definition.name };
}

export class SculptObjective extends CostFunction {
  readonly definition: CostFunctionDefinition;

  constructor(def: SculptWorldDefinition) {
    super();
    const base = resolveBase(def);
    const evaluate = composeSculptEval(def);

    const est = estimateOptimum(evaluate, def.domain, undefined, 41);
    const globalMinima: CriticalPoint[] = isFinite(est.value)
      ? [{ x1: est.x1, x2: est.x2, value: est.value, type: 'global-minimum', gradientMagnitude: 0 }]
      : [];

    const active = def.features.filter(f => f.enabled);
    const negCount = active.filter(f => f.amplitude < 0).length;

    this.definition = {
      id: def.id,
      name: def.name,
      shortName: def.name,
      dimension: 2,
      evaluate,
      domain: { ...def.domain },
      knownGlobalMinima: globalMinima,
      functionClass: negCount >= 2 ? 'multimodal' : 'nonconvex',
      source: 'custom',
      referenceSource: 'estimated',
      metadata: {
        description: def.metadata?.description ?? `Sculpted landscape on ${base.name}.`,
        difficulty: 'Custom',
        topologyNotes: `${active.length} sculpt feature(s)${negCount >= 2 ? ', multimodal' : ''}`,
      },
    };
  }
}

export function buildSculptObjective(def: SculptWorldDefinition): { objective: SculptObjective; domain: SearchDomain; name: string } {
  const objective = new SculptObjective(def);
  return { objective, domain: { ...def.domain }, name: def.name };
}

// ---------------------------------------------------------------- feature factory
let counter = 0;
export function makeSculptFeature(kind: SculptFeatureKind, x1: number, x2: number, domain: SearchDomain): SculptFeature {
  counter++;
  const spanX = domain.x1Max - domain.x1Min;
  const spanZ = domain.x2Max - domain.x2Min;
  const baseRadius = Math.max(spanX, spanZ) * 0.18;
  const id = `feat_${Date.now().toString(36)}_${counter}`;

  const signed: Record<SculptFeatureKind, number> = {
    valley: -6, basin: -7, mountain: 6, ridge: 5, plateau: 5,
  };

  const sigmaX1 = kind === 'ridge' ? baseRadius * 3.2 : baseRadius;
  const sigmaX2 = kind === 'ridge' ? baseRadius * 0.45 : baseRadius;

  return {
    id, kind, x1, x2,
    amplitude: signed[kind],
    sigmaX1, sigmaX2,
    rotation: 0,
    softness: kind === 'plateau' ? 2 : undefined,
    enabled: true,
  };
}

// ---------------------------------------------------------------- presets
function feat(kind: SculptFeatureKind, x1: number, x2: number, amplitude: number, sigmaX1: number, sigmaX2: number, rotation = 0, softness?: number): SculptFeature {
  counter++;
  return {
    id: `feat_p${counter}`,
    kind, x1, x2, amplitude, sigmaX1, sigmaX2, rotation, softness, enabled: true,
  };
}

const BLANK = (): SculptBase => ({ kind: 'blank' });
const DOMAIN_55: SearchDomain = { x1Min: -5, x1Max: 5, x2Min: -5, x2Max: 5 };

export interface SculptPreset {
  id: string;
  name: string;
  purpose: string;
  build: () => SculptWorldDefinition;
}

export const SCULPT_PRESETS: SculptPreset[] = [
  {
    id: 'double-valley',
    name: 'Double Valley',
    purpose: 'Local vs global optimum.',
    build: () => ({
      schemaVersion: SCULPT_SCHEMA_VERSION, id: 'preset_double', name: 'Double Valley',
      domain: { ...DOMAIN_55 }, base: BLANK(),
      features: [
        feat('valley', -2, -1, -5, 2.2, 2.2),
        feat('valley', 2, 2, -9, 1.0, 1.0),
      ],
      metadata: { tags: ['teaching', 'multimodal'], description: 'A wide shallow valley beside a narrow deeper one.' },
    }),
  },
  {
    id: 'triple-basin',
    name: 'Triple Basin',
    purpose: 'Multimodal search.',
    build: () => ({
      schemaVersion: SCULPT_SCHEMA_VERSION, id: 'preset_triple', name: 'Triple Basin',
      domain: { ...DOMAIN_55 }, base: BLANK(),
      features: [
        feat('basin', -3, -2, -6, 1.3, 1.3),
        feat('basin', 3, -1, -7, 1.1, 1.1),
        feat('basin', 0, 3.2, -8, 0.9, 0.9),
      ],
      metadata: { tags: ['teaching', 'multimodal'], description: 'Three attraction regions of differing depth.' },
    }),
  },
  {
    id: 'ridge-escape',
    name: 'Ridge Escape',
    purpose: 'Exploration across a barrier.',
    build: () => ({
      schemaVersion: SCULPT_SCHEMA_VERSION, id: 'preset_ridge', name: 'Ridge Escape',
      domain: { ...DOMAIN_55 }, base: BLANK(),
      features: [
        feat('valley', -3, 0, -7, 1.6, 2.4),
        feat('valley', 3, 0, -7, 1.6, 2.4),
        feat('ridge', 0, 0, 7, 0.7, 4.4),
      ],
      metadata: { tags: ['teaching', 'barrier'], description: 'Two low regions separated by a high-cost analytic ridge.' },
    }),
  },
  {
    id: 'deceptive-landscape',
    name: 'Deceptive Valley',
    purpose: 'Premature convergence.',
    build: () => ({
      schemaVersion: SCULPT_SCHEMA_VERSION, id: 'preset_deceptive', name: 'Deceptive Valley',
      domain: { ...DOMAIN_55 }, base: BLANK(),
      features: [
        feat('valley', 0, 0, -3.5, 3.0, 3.0),
        feat('valley', -2.4, 2.2, -8, 0.7, 0.7),
      ],
      metadata: { tags: ['teaching', 'deceptive'], description: 'A wide obvious basin hides a narrow deeper optimum.' },
    }),
  },
  {
    id: 'narrow-canyon',
    name: 'Narrow Canyon',
    purpose: 'Conditioning / directional search.',
    build: () => ({
      schemaVersion: SCULPT_SCHEMA_VERSION, id: 'preset_canyon', name: 'Narrow Canyon',
      domain: { ...DOMAIN_55 }, base: BLANK(),
      features: [
        feat('valley', 0, 0, -9, 5.0, 0.55, Math.PI / 4),
      ],
      metadata: { tags: ['teaching', 'narrow'], description: 'A long narrow rotated basin.' },
    }),
  },
  {
    id: 'formula-plus-sculpt',
    name: 'Formula + Sculpt',
    purpose: 'Hybrid formula and sculpted features.',
    build: () => ({
      schemaVersion: SCULPT_SCHEMA_VERSION, id: 'preset_hybrid', name: 'Formula + Sculpt',
      domain: { ...DOMAIN_55 },
      base: { kind: 'custom', definition: { expression: 'x1^2 + x2^2', variables: ['x1', 'x2'], domain: { ...DOMAIN_55 }, name: 'Convex Bowl' } },
      features: [
        feat('mountain', 2, 2, 6, 1.4, 1.4),
        feat('valley', -1.2, -1.2, -4, 1.8, 1.8),
      ],
      metadata: { tags: ['teaching', 'hybrid'], description: 'A formula base modified by a mountain and a valley.' },
    }),
  },
];
