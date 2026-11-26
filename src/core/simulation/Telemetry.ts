import type { SimulationSnapshot } from './types';

export interface TelemetryData {
  iteration: number[];
  evaluations: number[];
  bestFitness: number[];
  meanFitness: number[];
  worstFitness: number[];
  diversity: number[];
  feasibleRatio: number[];
  distanceToReference: number[];
}

/**
 * Raw telemetry only. Values are stored per logical iteration; the UI decides
 * how (and how compactly) to visualise them.
 */
export class Telemetry {
  private data: TelemetryData = {
    iteration: [],
    evaluations: [],
    bestFitness: [],
    meanFitness: [],
    worstFitness: [],
    diversity: [],
    feasibleRatio: [],
    distanceToReference: [],
  };

  record(snapshot: SimulationSnapshot, distanceToReference = NaN): void {
    this.data.iteration.push(snapshot.iteration);
    this.data.evaluations.push(snapshot.evaluations);
    this.data.bestFitness.push(snapshot.statistics.bestFitness);
    this.data.meanFitness.push(snapshot.statistics.meanFitness);
    this.data.worstFitness.push(snapshot.statistics.worstFitness);
    this.data.diversity.push(snapshot.statistics.diversity);
    this.data.feasibleRatio.push(snapshot.statistics.feasibleRatio);
    this.data.distanceToReference.push(distanceToReference);
  }

  getData(): TelemetryData {
    return this.data;
  }

  clear(): void {
    this.data = {
      iteration: [],
      evaluations: [],
      bestFitness: [],
      meanFitness: [],
      worstFitness: [],
      diversity: [],
      feasibleRatio: [],
      distanceToReference: [],
    };
  }
}
