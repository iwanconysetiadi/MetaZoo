import { describe, it, expect } from 'vitest';
import '../src/core/benchmarks';
import { parseExpression, ExpressionError } from '../src/core/expression';
import { validateObjective } from '../src/core/custom/validation';
import { buildChallengeObjective, ChallengeDefinition, IDENTITY_TRANSFORM, SCHEMA_VERSION } from '../src/core/custom/ChallengeObjective';
import { makeCustomChallenge, validateChallengeDefinition } from '../src/core/custom/factory';
import { makeCustomObjectiveDefinition } from '../src/core/custom/factory';

const DOMAIN = { x1Min: -5, x1Max: 5, x2Min: -5, x2Max: 5 };

function customChallenge(expression: string, extra: Partial<ChallengeDefinition> = {}): ChallengeDefinition {
  const base = makeCustomChallenge(makeCustomObjectiveDefinition(expression, 'Test', DOMAIN));
  return { ...base, ...extra };
}

describe('expression engine', () => {
  it('evaluates basic expressions with correct precedence', () => {
    expect(parseExpression('x1^2 + x2^2').evaluate(2, 3)).toBeCloseTo(13, 6);
    expect(parseExpression('2 + 3 * 4').evaluate(0, 0)).toBeCloseTo(14, 6);
    expect(parseExpression('-(2 + 3)').evaluate(0, 0)).toBeCloseTo(-5, 6);
    expect(parseExpression('2^3^2').evaluate(0, 0)).toBeCloseTo(512, 6); // right-assoc
  });

  it('supports functions, aliases and constants', () => {
    expect(parseExpression('sin(pi/2)').evaluate(0, 0)).toBeCloseTo(1, 6);
    expect(parseExpression('x*x + y*y').evaluate(3, 4)).toBeCloseTo(25, 6); // x,y aliases
    expect(parseExpression('sqrt(x1^2+x2^2)').evaluate(3, 4)).toBeCloseTo(5, 6);
    expect(parseExpression('min(x1,x2) + max(x1,x2)').evaluate(2, 7)).toBeCloseTo(9, 6);
  });

  it('rejects invalid expressions with a position', () => {
    expect(() => parseExpression('sin(x1 +')).toThrow(ExpressionError);
    expect(() => parseExpression('x1 + foo')).toThrow(ExpressionError);
    try {
      parseExpression('x1 +');
    } catch (e) {
      expect(e).toBeInstanceOf(ExpressionError);
      expect((e as ExpressionError).position).toBeGreaterThanOrEqual(0);
    }
  });

  it('validates partial domains (log undefined for x1<0)', () => {
    const r = validateObjective('log(x1)', DOMAIN, 40);
    expect(r.parseError).toBeUndefined();
    expect(r.stats!.invalidFraction).toBeGreaterThan(0.3);
  });
});

describe('composed custom objective', () => {
  it('builds an interactive objective from a custom expression', () => {
    const ch = customChallenge('x1^2 + x2^2');
    const { objective } = buildChallengeObjective(ch);
    expect(objective.evaluate(2, 3)).toBeCloseTo(13, 6);
    // numerical gradient should behave (CostFunction fallback)
    const g = objective.gradient(2, 3);
    expect(g.x).toBeCloseTo(4, 2);
    expect(g.y).toBeCloseTo(6, 2);
    const est = objective.getGlobalMinima()[0];
    expect(Math.hypot(est.x1, est.x2)).toBeLessThan(0.3);
    expect(objective.definition.referenceSource).toBe('estimated');
  });

  it('applies rotation to objective coordinates (not just the mesh)', () => {
    const aniso = makeCustomObjectiveDefinition('x1^2 + 10*x2^2', 'Aniso', DOMAIN);
    const base = makeCustomChallenge(aniso);
    const noRot = buildChallengeObjective(base).objective.evaluateTrue(1, 0);
    const rotated = buildChallengeObjective({
      ...base,
      transform: { ...IDENTITY_TRANSFORM, rotation: Math.PI / 2 },
    }).objective.evaluateTrue(1, 0);
    expect(noRot).toBeCloseTo(1, 4);
    expect(rotated).toBeCloseTo(10, 4);
  });

  it('adds a false oasis as a mathematical basin', () => {
    const builtinBase = { kind: 'builtin' as const, id: 'sphere' };
    const plain = buildChallengeObjective({
      schemaVersion: SCHEMA_VERSION, id: 'x', name: 'p', base: builtinBase,
      transform: { ...IDENTITY_TRANSFORM }, syntheticBasins: [], constraints: [], seed: 1, metadata: { tags: [] },
    }).objective.evaluateTrue(2, 2);
    const withBasin = buildChallengeObjective({
      schemaVersion: SCHEMA_VERSION, id: 'y', name: 'b', base: builtinBase,
      transform: { ...IDENTITY_TRANSFORM },
      syntheticBasins: [{ x1: 2, x2: 2, depth: 5, radius: 1 }],
      constraints: [], seed: 1, metadata: { tags: [] },
    }).objective.evaluateTrue(2, 2);
    expect(plain).toBeCloseTo(8, 4);
    expect(withBasin).toBeCloseTo(3, 4);
  });

  it('classifies feasibility for allowed and forbidden regions', () => {
    const allowed = buildChallengeObjective(customChallenge('x1^2+x2^2', {
      constraints: [{ id: 'c', shape: { kind: 'circle', cx: 0, cz: 0, r: 3 }, mode: 'allowed' }],
    })).objective;
    expect(allowed.isFeasible(0, 0)).toBe(true);
    expect(allowed.isFeasible(4, 0)).toBe(false);

    const forbidden = buildChallengeObjective(customChallenge('x1^2+x2^2', {
      constraints: [{ id: 'c', shape: { kind: 'circle', cx: 0, cz: 0, r: 3 }, mode: 'forbidden' }],
    })).objective;
    expect(forbidden.isFeasible(0, 0)).toBe(false);
    expect(forbidden.isFeasible(4, 0)).toBe(true);
  });

  it('produces reproducible seeded noise (true vs observed)', () => {
    const ch = customChallenge('x1^2+x2^2', { noise: { enabled: true, sigma: 1, seed: 42 } });
    const a = buildChallengeObjective(ch).objective;
    const b = buildChallengeObjective(ch).objective;
    expect(a.evaluateTrue(1, 2)).toBeCloseTo(5, 6);
    const o1 = a.evaluateObserved(1, 2);
    const o2 = a.evaluateObserved(1, 2);
    expect(o1).toBe(o2);
    expect(b.evaluateObserved(1, 2)).toBe(o1);
  });
});

describe('serialization', () => {
  it('round-trips a challenge to JSON and reproduces values', () => {
    const ch = buildChallengeDefinitionFixture();
    const json = JSON.stringify(ch);
    const parsed = validateChallengeDefinition(JSON.parse(json));
    expect(parsed.ok).toBe(true);

    const a = buildChallengeObjective(ch).objective;
    const b = buildChallengeObjective(parsed.challenge!).objective;
    for (const [x1, x2] of [[0, 0], [1.3, -2.1], [-3.7, 4.2], [4.9, -4.9]]) {
      expect(b.evaluateTrue(x1, x2)).toBeCloseTo(a.evaluateTrue(x1, x2), 6);
    }
  });

  it('rejects malformed imported JSON', () => {
    expect(validateChallengeDefinition({ schemaVersion: 999 }).ok).toBe(false);
    expect(validateChallengeDefinition({ schemaVersion: SCHEMA_VERSION, name: 'x', base: { kind: 'builtin', id: 'nope' } }).ok).toBe(false);
  });
});

function buildChallengeDefinitionFixture(): ChallengeDefinition {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'fixture',
    name: 'Rotated Rastrigin + Basin',
    base: { kind: 'builtin', id: 'rastrigin' },
    transform: { translationX: 0.5, translationX2: -0.5, rotation: 0.6, scaleX1: 1.2, scaleX2: 0.8 },
    syntheticBasins: [{ x1: 2, x2: -2, depth: 8, radius: 1.5 }],
    constraints: [{ id: 'c', shape: { kind: 'rect', x1Min: -4, x1Max: 4, x2Min: -4, x2Max: 4 }, mode: 'allowed' }],
    seed: 2024,
    metadata: { tags: ['challenge', 'multimodal'] },
  };
}
