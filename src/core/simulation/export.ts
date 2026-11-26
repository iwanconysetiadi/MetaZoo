import type { SimulationEngine } from './SimulationEngine';
import type { TelemetryData } from './Telemetry';

function csvCell(value: unknown): string {
  if (value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value))) {
    return '';
  }
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportTelemetryCsv(telemetry: TelemetryData): string {
  const headers = [
    'iteration', 'evaluations', 'bestFitness', 'meanFitness', 'worstFitness',
    'diversity', 'feasibleRatio', 'distanceToReference',
    'centroidX', 'centroidY', 'spread',
  ] as const;
  const lines = [headers.join(',')];
  for (let i = 0; i < telemetry.iteration.length; i++) {
    lines.push(headers.map(key => csvCell(telemetry[key][i])).join(','));
  }
  return lines.join('\n');
}

export function exportRunHistory(engine: SimulationEngine): string {
  return JSON.stringify(engine.getHistory().getAll(), null, 2);
}

export function exportRunBundle(engine: SimulationEngine): {
  config: string;
  telemetryCsv: string;
  history: string;
} {
  return {
    config: engine.exportRunConfiguration(),
    telemetryCsv: exportTelemetryCsv(engine.getTelemetry().getData()),
    history: exportRunHistory(engine),
  };
}
