import { globalRegistry } from '../math/CostFunction';
import {
  ChallengeDefinition, IDENTITY_TRANSFORM, SCHEMA_VERSION, TransformDef,
  SyntheticBasin, ConstraintDef, NoiseDef, DynamicDef,
} from './ChallengeObjective';
import { SearchDomain } from './ReferenceOptimum';
import { CustomObjectiveDefinition } from './ChallengeObjective';

export function newId(prefix: string): string {
  const rand = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? (globalThis.crypto as Crypto).randomUUID()
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${prefix}_${rand}`;
}

const DEFAULT_DOMAIN: SearchDomain = { x1Min: -5, x1Max: 5, x2Min: -5, x2Max: 5 };

export function defaultDomainForBuiltin(id: string): SearchDomain {
  const fn = globalRegistry.get(id);
  if (!fn) return { ...DEFAULT_DOMAIN };
  const d = fn.definition.domain;
  return { x1Min: d.x1Min, x1Max: d.x1Max, x2Min: d.x2Min, x2Max: d.x2Max };
}

export function makeCustomObjectiveDefinition(
  expression: string, name: string, domain: SearchDomain = DEFAULT_DOMAIN, description?: string,
): CustomObjectiveDefinition {
  return { expression, variables: ['x1', 'x2'], domain: { ...domain }, name, description };
}

export function makeBuiltinChallenge(id: string, name?: string): ChallengeDefinition {
  const fn = globalRegistry.get(id);
  const nm = name ?? (fn ? fn.definition.name : id);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('challenge'),
    name: nm,
    base: { kind: 'builtin', id },
    transform: { ...IDENTITY_TRANSFORM },
    syntheticBasins: [],
    constraints: [],
    seed: 1337,
    metadata: { tags: [] },
  };
}

export function makeCustomChallenge(
  definition: CustomObjectiveDefinition,
): ChallengeDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('challenge'),
    name: definition.name,
    base: { kind: 'custom', definition },
    transform: { ...IDENTITY_TRANSFORM },
    syntheticBasins: [],
    constraints: [],
    seed: 1337,
    metadata: { tags: ['custom'] },
  };
}

// ---------------------------------------------------------------- presets
function preset(
  name: string, base: ChallengeDefinition['base'],
  parts: Partial<ChallengeDefinition>,
): ChallengeDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('preset'),
    name,
    base,
    transform: { ...IDENTITY_TRANSFORM },
    syntheticBasins: [],
    constraints: [],
    seed: 2024,
    metadata: { tags: [] },
    ...parts,
  };
}

const DEG = Math.PI / 180;

export const CHALLENGE_PRESETS: Array<{ id: string; name: string; purpose: string; build: () => ChallengeDefinition }> = [
  {
    id: 'rotated-rastrigin',
    name: 'Rotated Rastrigin',
    purpose: 'Variable coupling with multimodal structure.',
    build: () => preset("Rotated Rastrigin", { kind: 'builtin', id: 'rastrigin' }, {
      transform: { translationX: 0, translationX2: 0, rotation: 35 * DEG, scaleX1: 1, scaleX2: 1 },
      metadata: { tags: ['multimodal', 'rotated'], learningObjective: 'Explore how rotation couples the search variables.' },
    }),
  },
  {
    id: 'deceptive-oasis',
    name: 'Deceptive Oasis',
    purpose: 'Exploration vs premature convergence.',
    build: () => preset('Deceptive Oasis', { kind: 'builtin', id: 'sphere' }, {
      syntheticBasins: [{ x1: -3.2, x2: -3.2, depth: 17.5, radius: 1.3 }],
      metadata: { tags: ['deceptive', 'basin'], learningObjective: 'A false attractor competes with the true optimum.' },
    }),
  },
  {
    id: 'multi-oasis',
    name: 'Multi-Oasis',
    purpose: 'Several attractive target regions.',
    build: () => preset('Multi-Oasis', { kind: 'builtin', id: 'sphere' }, {
      syntheticBasins: [
        { x1: 3, x2: 3, depth: 17.6, radius: 1.2 },
        { x1: -3, x2: 3, depth: 17.6, radius: 1.2 },
        { x1: 3, x2: -3, depth: 17.6, radius: 1.2 },
        { x1: -3, x2: -3, depth: 17.6, radius: 1.2 },
      ],
      metadata: { tags: ['multi-optimum'], learningObjective: 'Compare several near-equivalent attraction basins.' },
    }),
  },
  {
    id: 'restricted-sanctuary',
    name: 'Restricted Sanctuary',
    purpose: 'Constrained optimization.',
    build: () => preset('Restricted Sanctuary', { kind: 'builtin', id: 'rastrigin' }, {
      constraints: [{ id: newId('c'), shape: { kind: 'circle', cx: 0, cz: 0, r: 3.2 }, mode: 'allowed' }],
      metadata: { tags: ['constrained'], learningObjective: 'Search only inside the feasible sanctuary.' },
    }),
  },
  {
    id: 'noisy-valley',
    name: 'Noisy Valley',
    purpose: 'Noisy objective evaluation.',
    build: () => preset('Noisy Valley', { kind: 'builtin', id: 'rosenbrock' }, {
      noise: { enabled: true, sigma: 0.4, seed: 424242 },
      metadata: { tags: ['noisy'], learningObjective: 'Observe how noise affects evaluation of a narrow valley.' },
    }),
  },
  {
    id: 'moving-oasis',
    name: 'Moving Oasis',
    purpose: 'Dynamic optimization.',
    build: () => preset('Moving Oasis', { kind: 'builtin', id: 'sphere' }, {
      dynamics: { enabled: true, mode: 'circular', amplitude: 3, speed: 0.8, depth: 30, radius: 1.3, centerX: 0, centerZ: 0 },
      metadata: { tags: ['dynamic'], learningObjective: 'Track a target that moves deterministically over time.' },
    }),
  },
];

// ---------------------------------------------------------------- import validation
export interface ImportResult { ok: boolean; challenge?: ChallengeDefinition; error?: string; }

export function validateChallengeDefinition(raw: unknown): ImportResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Not a JSON object.' };
  const d = raw as Record<string, unknown>;
  if (d.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: `Unsupported schemaVersion (expected ${SCHEMA_VERSION}).` };
  if (typeof d.name !== 'string') return { ok: false, error: 'Missing name.' };
  if (typeof d.base !== 'object' || d.base === null) return { ok: false, error: 'Missing base objective.' };

  const base = d.base as Record<string, unknown>;
  if (base.kind === 'builtin') {
    if (typeof base.id !== 'string' || !globalRegistry.has(base.id)) {
      return { ok: false, error: `Unknown base benchmark "${String(base.id)}".` };
    }
  } else if (base.kind === 'custom') {
    const cd = base.definition as Record<string, unknown> | undefined;
    if (!cd || typeof cd.expression !== 'string') return { ok: false, error: 'Custom base missing expression.' };
    const dom = cd.domain as Record<string, unknown> | undefined;
    if (!dom || ![dom.x1Min, dom.x1Max, dom.x2Min, dom.x2Max].every(v => typeof v === 'number' && isFinite(v as number))) {
      return { ok: false, error: 'Custom base has invalid domain.' };
    }
  } else {
    return { ok: false, error: 'Invalid base kind.' };
  }

  return { ok: true, challenge: d as unknown as ChallengeDefinition };
}
