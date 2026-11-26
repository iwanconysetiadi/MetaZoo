import { parseExpression, ParsedExpression, ExpressionError } from '../expression';
import { SearchDomain } from './ReferenceOptimum';

export interface DomainValidation {
  ok: boolean;
  errors: string[];
}

export function validateDomain(domain: SearchDomain): DomainValidation {
  const errors: string[] = [];
  const { x1Min, x1Max, x2Min, x2Max } = domain;
  const finiteAll = [x1Min, x1Max, x2Min, x2Max].every(v => typeof v === 'number' && isFinite(v));
  if (!finiteAll) errors.push('Domain bounds must be finite numbers.');
  if (x1Min >= x1Max) errors.push('x₁ min must be less than x₁ max.');
  if (x2Min >= x2Max) errors.push('x₂ min must be less than x₂ max.');
  if (finiteAll) {
    const spanX = x1Max - x1Min;
    const spanZ = x2Max - x2Min;
    if (spanX > 1e6 || spanZ > 1e6) errors.push('Domain is extremely large.');
    if (spanX < 1e-6 || spanZ < 1e-6) errors.push('Domain is too small.');
  }
  return { ok: errors.length === 0, errors };
}

export interface SampleStats {
  total: number;
  finite: number;
  invalidFraction: number;
  min: number;
  max: number;
  median: number;
  range: number;
  extremeRange: boolean;
}

export interface ValidationResult {
  parsed?: ParsedExpression;
  domainErrors: string[];
  parseError?: { message: string; position: number };
  stats?: SampleStats;
}

export function validateObjective(expression: string, domain: SearchDomain, grid = 48): ValidationResult {
  const domainCheck = validateDomain(domain);
  const result: ValidationResult = { domainErrors: domainCheck.errors };

  let parsed: ParsedExpression;
  try {
    parsed = parseExpression(expression);
  } catch (e) {
    if (e instanceof ExpressionError) {
      result.parseError = { message: e.message, position: e.position };
    } else {
      result.parseError = { message: 'Invalid expression', position: 0 };
    }
    return result;
  }
  result.parsed = parsed;

  if (!domainCheck.ok) return result;

  const { x1Min, x1Max, x2Min, x2Max } = domain;
  const spanX = x1Max - x1Min;
  const spanZ = x2Max - x2Min;
  const values: number[] = [];
  let finite = 0;
  let total = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < grid; i++) {
    const x1 = x1Min + (i / (grid - 1)) * spanX;
    for (let j = 0; j < grid; j++) {
      const x2 = x2Min + (j / (grid - 1)) * spanZ;
      total++;
      let v: number;
      try {
        v = parsed.evaluate(x1, x2);
      } catch {
        v = NaN;
      }
      if (isFinite(v)) {
        finite++;
        values.push(v);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }

  const sorted = values.slice().sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const range = finite ? max - min : 0;

  result.stats = {
    total,
    finite,
    invalidFraction: total ? (total - finite) / total : 1,
    min: finite ? min : NaN,
    max: finite ? max : NaN,
    median,
    range,
    extremeRange: finite ? (range > 1e6 || (Math.abs(max) > 1e6)) : false,
  };
  return result;
}
