import type { CandidateState, OptimizerState, OptimizerStatistics } from './types';
import type { ConstraintService } from './ConstraintService';

export function computeStatistics(
  candidates: CandidateState[],
  constraints?: ConstraintService,
): { statistics: OptimizerStatistics; best: OptimizerState['best'] } {
  const active = candidates.filter(c => c.active && Number.isFinite(c.fitness));

  if (active.length === 0) {
    return {
      statistics: {
        bestFitness: Infinity,
        meanFitness: Infinity,
        worstFitness: Infinity,
        medianFitness: Infinity,
        diversity: 0,
        feasibleRatio: 0,
        candidateCount: 0,
      },
      best: { position: { x: 0, y: 0 }, fitness: Infinity },
    };
  }

  let bestCandidate = active[0];
  let sum = 0;
  let worst = -Infinity;
  let feasibleCount = 0;
  let cx = 0;
  let cy = 0;

  for (const candidate of active) {
    if (candidate.fitness < bestCandidate.fitness) bestCandidate = candidate;
    sum += candidate.fitness;
    if (candidate.fitness > worst) worst = candidate.fitness;
    cx += candidate.position.x;
    cy += candidate.position.y;
    if (!constraints || constraints.isFeasible(candidate.position.x, candidate.position.y)) {
      feasibleCount++;
    }
  }

  cx /= active.length;
  cy /= active.length;

  let diversitySum = 0;
  for (const candidate of active) {
    diversitySum += Math.hypot(candidate.position.x - cx, candidate.position.y - cy);
  }

  const sorted = active.map(c => c.fitness).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];

  const statistics: OptimizerStatistics = {
    bestFitness: bestCandidate.fitness,
    meanFitness: sum / active.length,
    worstFitness: worst,
    medianFitness: median,
    diversity: active.length > 1 ? diversitySum / active.length : 0,
    feasibleRatio: feasibleCount / active.length,
    candidateCount: active.length,
    centroid: active.length > 1 ? { x: cx, y: cy } : undefined,
    spread: active.length > 1 ? Math.sqrt(diversitySum / active.length) : 0,
  };

  return {
    statistics,
    best: {
      candidateId: bestCandidate.id,
      position: { x: bestCandidate.position.x, y: bestCandidate.position.y },
      fitness: bestCandidate.fitness,
    },
  };
}
