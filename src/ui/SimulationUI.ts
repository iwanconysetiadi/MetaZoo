import { SimulationEngine } from '../core/simulation/SimulationEngine';
import {
  listOptimizerDescriptors, getOptimizerDescriptor,
} from '../core/simulation/optimizers/registry';
import type {
  BoundaryPolicy, CandidateState, OptimizerEvent, RunConfiguration,
} from '../core/simulation/types';

export interface SimulationUICallbacks {
  onBeforeOpen?: () => void;
}

interface FormState {
  optimizerId: string;
  seed: number;
  populationSize: number;
  maxEvaluations: number;
  maxIterations: number;
  boundaryPolicy: BoundaryPolicy;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function numberText(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return value.toExponential(2);
  return value.toFixed(digits);
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export class SimulationUI {
  private engine: SimulationEngine;
  private callbacks: SimulationUICallbacks;

  private dockButton!: HTMLButtonElement;
  private panel!: HTMLElement;
  private strip!: HTMLElement;
  private inspector!: HTMLElement;
  private staleBanner!: HTMLElement;
  private panelBody!: HTMLElement;
  private chartCanvas!: HTMLCanvasElement;
  private scrubber!: HTMLInputElement;
  private scrubLabel!: HTMLElement;

  private stripPlay!: HTMLButtonElement;
  private stripStep!: HTMLButtonElement;
  private stripReset!: HTMLButtonElement;
  private stripIteration!: HTMLElement;
  private stripEvaluations!: HTMLElement;
  private stripBest!: HTMLElement;
  private stripDiversity!: HTMLElement;
  private stripSpeed!: HTMLSelectElement;

  private form: FormState = {
    optimizerId: 'random-search',
    seed: 42,
    populationSize: 30,
    maxEvaluations: 5000,
    maxIterations: 500,
    boundaryPolicy: 'reflect',
  };

  private setupOpen = true;
  private panelOpen = false;
  private logScale = false;
  private inspectedId: string | null = null;
  private lastEventIteration = -1;
  private eventLog: OptimizerEvent[] = [];
  private lastDomUpdate = 0;
  private lastChartIteration = -1;
  private lastError: string | null = null;

  constructor(engine: SimulationEngine, callbacks: SimulationUICallbacks = {}) {
    this.engine = engine;
    this.callbacks = callbacks;
    this.buildDockButton();
    this.buildPanel();
    this.buildStrip();
    this.buildInspector();
    this.buildStaleBanner();
    this.renderPanel();
    this.update(true);
  }

  // ---------------------------------------------------------------- build
  private buildDockButton(): void {
    const dock = document.getElementById('ui-dock');
    if (!dock) return;
    dock.appendChild(el('div', 'dock-divider'));
    this.dockButton = el('button', 'dock-btn sim-dock-btn');
    this.dockButton.appendChild(el('span', 'ico', '▶'));
    this.dockButton.appendChild(el('span', 'lbl', 'Simulation'));
    this.dockButton.title = 'Open simulation controls';
    this.dockButton.addEventListener('click', () => this.togglePanel());
    dock.appendChild(this.dockButton);

    dock.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button');
      if (button && button !== this.dockButton) this.closePanel();
    });
  }

  private buildPanel(): void {
    this.panel = el('div');
    this.panel.id = 'ui-sim-panel';

    const head = el('div', 'sim-panel-head');
    head.appendChild(el('span', 'sim-panel-title', 'Simulation'));
    const close = el('button', 'icon-btn', '✕');
    close.addEventListener('click', () => this.closePanel());
    head.appendChild(close);
    this.panel.appendChild(head);

    this.panelBody = el('div', 'sim-panel-body');
    this.panel.appendChild(this.panelBody);

    document.body.appendChild(this.panel);
  }

  private buildStrip(): void {
    this.strip = el('div');
    this.strip.id = 'ui-sim-strip';

    this.stripPlay = el('button', 'sim-strip-btn', '▶');
    this.stripPlay.title = 'Play / pause';
    this.stripPlay.addEventListener('click', () => this.togglePlay());
    this.stripStep = el('button', 'sim-strip-btn', '⏭');
    this.stripStep.title = 'Step one logical iteration';
    this.stripStep.addEventListener('click', () => this.engine.stepOnce());
    this.stripReset = el('button', 'sim-strip-btn', '↺');
    this.stripReset.title = 'Reset simulation';
    this.stripReset.addEventListener('click', () => this.engine.reset());

    const metrics = el('div', 'sim-strip-metrics');
    this.stripIteration = this.stripMetric(metrics, 'it');
    this.stripEvaluations = this.stripMetric(metrics, 'eval');
    this.stripBest = this.stripMetric(metrics, 'best');
    this.stripDiversity = this.stripMetric(metrics, 'div');

    this.stripSpeed = el('select', 'sim-strip-speed') as HTMLSelectElement;
    for (const speed of SPEEDS) {
      const option = el('option') as HTMLOptionElement;
      option.value = String(speed);
      option.textContent = `${speed}×`;
      this.stripSpeed.appendChild(option);
    }
    this.stripSpeed.value = String(this.engine.getPlaybackSpeed());
    this.stripSpeed.addEventListener('change', () => {
      this.engine.setPlaybackSpeed(parseFloat(this.stripSpeed.value));
    });

    this.strip.appendChild(this.stripPlay);
    this.strip.appendChild(this.stripStep);
    this.strip.appendChild(this.stripReset);
    this.strip.appendChild(metrics);
    this.strip.appendChild(this.stripSpeed);
    document.body.appendChild(this.strip);
  }

  private stripMetric(parent: HTMLElement, key: string): HTMLElement {
    const wrap = el('span', 'sim-strip-metric');
    wrap.appendChild(el('span', 'k', key));
    const value = el('b', '', '—');
    wrap.appendChild(value);
    parent.appendChild(wrap);
    return value;
  }

  private buildInspector(): void {
    this.inspector = el('div');
    this.inspector.id = 'ui-sim-inspector';
    document.body.appendChild(this.inspector);
  }

  private buildStaleBanner(): void {
    this.staleBanner = el('div');
    this.staleBanner.id = 'ui-sim-stale';
    const message = el('div', 'sim-stale-message');
    message.appendChild(el('b', '', 'World changed.'));
    message.appendChild(el('span', '', ' This simulation is based on the previous world definition.'));
    this.staleBanner.appendChild(message);
    const reset = el('button', 'btn primary', 'RESET SIMULATION');
    reset.addEventListener('click', () => this.engine.reset());
    this.staleBanner.appendChild(reset);
    document.body.appendChild(this.staleBanner);
  }

  // ---------------------------------------------------------------- panel
  private togglePanel(): void {
    if (this.panelOpen) this.closePanel();
    else this.openPanel();
  }
  openPanel(): void {
    this.callbacks.onBeforeOpen?.();
    this.panelOpen = true;
    this.panel.classList.add('open');
    this.dockButton?.classList.add('active');
    this.renderPanel();
  }

  private closePanel(): void {
    this.panelOpen = false;
    this.panel.classList.remove('open');
    this.dockButton?.classList.remove('active');
  }

  private renderPanel(): void {
    this.panelBody.innerHTML = '';
    const config = this.engine.getRunConfiguration();
    if (!config || this.setupOpen) {
      this.renderSetup(config);
    } else {
      this.renderRunControls(config);
    }
  }

  private renderSetup(config: RunConfiguration | null): void {
    const form = this.form;
    if (config && !this.setupOpen) {
      form.optimizerId = config.optimizerId;
      form.seed = config.seed;
      form.populationSize = config.populationSize;
      form.maxEvaluations = config.maxEvaluations;
      form.maxIterations = config.maxIterations;
      form.boundaryPolicy = config.boundaryPolicy;
    }

    this.panelBody.appendChild(el('div', 'sim-section-label', 'Optimizer'));
    const optimizerSelect = el('select', 'sim-select') as HTMLSelectElement;
    for (const descriptor of listOptimizerDescriptors()) {
      const option = el('option') as HTMLOptionElement;
      option.value = descriptor.id;
      option.textContent = descriptor.engineTest ? `${descriptor.name}` : descriptor.name;
      optimizerSelect.appendChild(option);
    }
    optimizerSelect.value = form.optimizerId;
    optimizerSelect.addEventListener('change', () => {
      form.optimizerId = optimizerSelect.value;
      const descriptor = getOptimizerDescriptor(form.optimizerId);
      if (descriptor) form.populationSize = descriptor.defaultPopulationSize;
      this.renderPanel();
    });
    this.panelBody.appendChild(optimizerSelect);

    const descriptor = getOptimizerDescriptor(form.optimizerId);
    if (descriptor) {
      const note = el('div', 'sim-note', descriptor.description);
      this.panelBody.appendChild(note);
    }

    const grid = el('div', 'sim-grid2');
    const population = this.numberField(grid, 'Population', form.populationSize, 1, 256, 1, (value) => {
      form.populationSize = value;
    });
    population.disabled = !(descriptor?.populationBased ?? true);
    if (population.disabled) population.value = '1';
    this.numberField(grid, 'Seed', form.seed, -2147483648, 2147483647, 1, (value) => {
      form.seed = value;
    });
    this.numberField(grid, 'Budget (evals)', form.maxEvaluations, 1, 1000000, 1, (value) => {
      form.maxEvaluations = value;
    });
    this.numberField(grid, 'Max iterations', form.maxIterations, 1, 1000000, 1, (value) => {
      form.maxIterations = value;
    });
    this.panelBody.appendChild(grid);

    const boundaryRow = el('div', 'sim-field-row');
    boundaryRow.appendChild(el('span', '', 'Boundary'));
    const boundary = el('select', 'sim-select small') as HTMLSelectElement;
    for (const [value, label] of [
      ['clamp', 'Clamp'], ['reflect', 'Reflect'], ['reject', 'Reject / Resample'], ['wrap', 'Wrap'],
    ] as Array<[BoundaryPolicy, string]>) {
      const option = el('option') as HTMLOptionElement;
      option.value = value;
      option.textContent = label;
      boundary.appendChild(option);
    }
    boundary.value = form.boundaryPolicy;
    boundary.addEventListener('change', () => { form.boundaryPolicy = boundary.value as BoundaryPolicy; });
    boundaryRow.appendChild(boundary);
    this.panelBody.appendChild(boundaryRow);

    this.panelBody.appendChild(el('div', 'sim-note',
      'Evaluation budget is strict. Initial population evaluations are counted.'));

    if (this.lastError) {
      this.panelBody.appendChild(el('div', 'sim-status err', this.lastError));
    }

    const initialize = el('button', 'btn primary sim-wide', 'INITIALIZE');
    initialize.addEventListener('click', () => this.initializeRun());
    this.panelBody.appendChild(initialize);

    if (config) {
      const back = el('button', 'btn sim-wide', 'Back to current run');
      back.addEventListener('click', () => { this.setupOpen = false; this.renderPanel(); });
      this.panelBody.appendChild(back);
    }
  }

  private renderRunControls(config: RunConfiguration): void {
    const descriptor = getOptimizerDescriptor(config.optimizerId);
    const status = el('div', 'sim-run-head');
    status.appendChild(el('b', '', descriptor?.name ?? config.optimizerId));
    status.appendChild(el('span', 'sim-run-sub', `seed ${config.seed} · ${config.boundaryPolicy}`));
    this.panelBody.appendChild(status);

    const controls = el('div', 'sim-control-row');
    const play = el('button', 'btn primary', '▶ PLAY');
    play.dataset.simAction = 'play';
    play.addEventListener('click', () => this.togglePlay());
    controls.appendChild(play);
    const step = el('button', 'btn', '⏭ STEP');
    step.dataset.simAction = 'step';
    step.addEventListener('click', () => this.engine.stepOnce());
    controls.appendChild(step);
    const reset = el('button', 'btn', '↺ RESET');
    reset.addEventListener('click', () => this.engine.reset());
    controls.appendChild(reset);
    this.panelBody.appendChild(controls);

    const speedRow = el('div', 'sim-field-row');
    speedRow.appendChild(el('span', '', 'Speed'));
    const speed = el('select', 'sim-select small') as HTMLSelectElement;
    for (const value of SPEEDS) {
      const option = el('option') as HTMLOptionElement;
      option.value = String(value);
      option.textContent = `${value}×`;
      speed.appendChild(option);
    }
    speed.value = String(this.engine.getPlaybackSpeed());
    speed.addEventListener('change', () => this.engine.setPlaybackSpeed(parseFloat(speed.value)));
    speedRow.appendChild(speed);
    this.panelBody.appendChild(speedRow);

    const metrics = el('div', 'sim-metrics');
    this.metric(metrics, 'Iteration', 'sim-iteration');
    this.metric(metrics, 'Evaluations', 'sim-evaluations');
    this.metric(metrics, 'Best', 'sim-best');
    this.metric(metrics, 'Diversity', 'sim-diversity');
    this.metric(metrics, 'Status', 'sim-status-value');
    this.panelBody.appendChild(metrics);

    const errorNode = el('div', 'sim-status err');
    errorNode.id = 'sim-error';
    errorNode.style.display = 'none';
    this.panelBody.appendChild(errorNode);

    this.panelBody.appendChild(el('div', 'sim-section-label', 'Convergence'));
    const chartWrap = el('div', 'sim-chart-wrap');
    this.chartCanvas = document.createElement('canvas');
    this.chartCanvas.className = 'sim-chart';
    this.chartCanvas.width = 680;
    this.chartCanvas.height = 220;
    chartWrap.appendChild(this.chartCanvas);
    this.panelBody.appendChild(chartWrap);

    const logRow = el('label', 'sim-check');
    const log = document.createElement('input');
    log.type = 'checkbox';
    log.checked = this.logScale;
    log.addEventListener('change', () => { this.logScale = log.checked; this.drawChart(true); });
    logRow.appendChild(log);
    logRow.appendChild(el('span', '', 'Log scale'));
    this.panelBody.appendChild(logRow);

    this.panelBody.appendChild(el('div', 'sim-section-label', 'History'));
    const scrubRow = el('div', 'sim-scrub-row');
    this.scrubber = document.createElement('input');
    this.scrubber.type = 'range';
    this.scrubber.min = '0';
    this.scrubber.step = '1';
    this.scrubber.className = 'sim-scrubber';
    this.scrubber.addEventListener('input', () => this.engine.scrubTo(parseInt(this.scrubber.value, 10)));
    scrubRow.appendChild(this.scrubber);
    this.scrubLabel = el('span', 'sim-scrub-label', '—');
    scrubRow.appendChild(this.scrubLabel);
    this.panelBody.appendChild(scrubRow);

    const historyRow = el('div', 'sim-control-row');
    const latest = el('button', 'btn', 'LATEST');
    latest.addEventListener('click', () => this.engine.returnToLive());
    historyRow.appendChild(latest);
    const replay = el('button', 'btn', 'REPLAY');
    replay.addEventListener('click', () => this.engine.startReplay());
    historyRow.appendChild(replay);
    this.panelBody.appendChild(historyRow);

    this.panelBody.appendChild(el('div', 'sim-section-label', 'Recent events'));
    const events = el('div', 'sim-events');
    events.id = 'sim-events';
    this.panelBody.appendChild(events);

    const actions = el('div', 'sim-control-row');
    const newRun = el('button', 'btn', 'NEW RUN');
    newRun.addEventListener('click', () => { this.setupOpen = true; this.lastError = null; this.renderPanel(); });
    actions.appendChild(newRun);
    const exportButton = el('button', 'btn', 'EXPORT CONFIG');
    exportButton.addEventListener('click', () => this.exportConfig());
    actions.appendChild(exportButton);
    this.panelBody.appendChild(actions);

    this.update(true);
  }

  private metric(parent: HTMLElement, label: string, id: string): void {
    const wrap = el('div', 'sim-metric');
    wrap.appendChild(el('span', 'k', label));
    const value = el('b', '', '—');
    value.id = id;
    wrap.appendChild(value);
    parent.appendChild(wrap);
  }

  private numberField(
    parent: HTMLElement, label: string, value: number,
    min: number, max: number, step: number,
    onChange: (value: number) => void,
  ): HTMLInputElement {
    const wrap = el('label', 'sim-field');
    wrap.appendChild(el('span', '', label));
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'sim-input';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('change', () => {
      const parsed = Number(input.value);
      if (Number.isFinite(parsed)) onChange(parsed);
    });
    wrap.appendChild(input);
    parent.appendChild(wrap);
    return input;
  }

  // ---------------------------------------------------------------- actions
  private initializeRun(): void {
    this.lastError = null;
    try {
      const descriptor = getOptimizerDescriptor(this.form.optimizerId);
      this.engine.initialize({
        optimizerId: this.form.optimizerId,
        seed: this.form.seed,
        populationSize: descriptor?.populationBased ? this.form.populationSize : 1,
        maxEvaluations: this.form.maxEvaluations,
        maxIterations: this.form.maxIterations,
        boundaryPolicy: this.form.boundaryPolicy,
        optimizerParameters: this.defaultParameters(this.form.optimizerId),
      });
      this.setupOpen = false;
      this.eventLog = [];
      this.lastEventIteration = -1;
      this.renderPanel();
      document.body.classList.add('sim-active');
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.renderPanel();
    }
  }

  private defaultParameters(optimizerId: string): Record<string, unknown> {
    if (optimizerId === 'gradient-descent') {
      return { learningRate: 0.08, maxStepFraction: 0.12 };
    }
    return {};
  }

  private togglePlay(): void {
    const status = this.engine.getStatus();
    if (this.engine.isReplaying()) {
      this.engine.stopReplay();
      return;
    }
    if (status === 'RUNNING') {
      this.engine.pause();
    } else if (status === 'READY' || status === 'PAUSED') {
      this.engine.play();
    }
  }

  private exportConfig(): void {
    const json = this.engine.exportRunConfiguration();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const config = this.engine.getRunConfiguration();
    anchor.href = url;
    anchor.download = `metazoo-run-${config?.seed ?? 'config'}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------------------------------------------------------------- inspector
  showCandidate(candidate: CandidateState): void {
    this.inspectedId = candidate.id;
    this.renderInspector(candidate);
    this.inspector.classList.add('show');
  }

  showCandidateIndex(index: number): void {
    const state = this.engine.getState();
    const candidate = state?.candidates[index];
    if (candidate) this.showCandidate(candidate);
  }

  /** Adopt a run that was started outside the panel (deep links, QA). */
  adoptExternalRun(): void {
    this.setupOpen = false;
    document.body.classList.add('sim-active');
    this.rebuildEventLog();
    if (this.panelOpen) this.renderPanel();
    this.update(true);
  }

  private rebuildEventLog(): void {
    this.eventLog = [];
    const snapshots = this.engine.getHistory().getAll();
    for (const snapshot of snapshots) {
      if (snapshot.events.length > 0) this.eventLog.push(...snapshot.events);
    }
    if (this.eventLog.length > 30) this.eventLog = this.eventLog.slice(-30);
    this.lastEventIteration = snapshots.length > 0
      ? snapshots[snapshots.length - 1].iteration : -1;
  }

  private renderInspector(candidate: CandidateState): void {
    this.inspector.innerHTML = '';
    const head = el('div', 'sim-insp-head');
    head.appendChild(el('span', '', 'Candidate'));
    const id = el('b', '', candidate.id);
    head.appendChild(id);
    const close = el('button', 'icon-btn', '✕');
    close.addEventListener('click', () => {
      this.inspectedId = null;
      this.inspector.classList.remove('show');
    });
    head.appendChild(close);
    this.inspector.appendChild(head);

    this.inspectorRow('Position', `(${candidate.position.x.toFixed(3)}, ${candidate.position.y.toFixed(3)})`);
    this.inspectorRow('Fitness', numberText(candidate.fitness));
    if (candidate.bestFitness !== undefined) {
      this.inspectorRow('Personal best', numberText(candidate.bestFitness));
    }
    if (candidate.role) this.inspectorRow('Role', candidate.role);
    this.inspectorRow('Active', candidate.active ? 'yes' : 'no');
  }

  private inspectorRow(key: string, value: string): void {
    const row = el('div', 'sim-insp-row');
    row.appendChild(el('span', '', key));
    row.appendChild(el('b', '', value));
    this.inspector.appendChild(row);
  }

  private refreshInspector(): void {
    if (!this.inspectedId) return;
    const state = this.engine.getDisplayedState();
    if (!state) return;
    const candidate = state.candidates.find(c => c.id === this.inspectedId);
    if (candidate) this.renderInspector(candidate);
  }

  // ---------------------------------------------------------------- update
  update(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastDomUpdate < 120) return;
    this.lastDomUpdate = now;

    const config = this.engine.getRunConfiguration();
    const status = this.engine.getStatus();
    const hasRun = !!config;

    document.body.classList.toggle('sim-active', hasRun);
    this.strip.classList.toggle('show', hasRun);

    if (!hasRun) {
      this.staleBanner.classList.remove('show');
      this.stripPlay.textContent = '▶';
      return;
    }

    const state = this.engine.getDisplayedState();
    const liveState = this.engine.getState();
    const history = this.engine.getHistory();
    const viewingHistory = this.engine.isViewingHistory();

    this.stripPlay.textContent = status === 'RUNNING' ? '❚❚' : '▶';
    const canControl = status === 'RUNNING' || status === 'READY' || status === 'PAUSED';
    this.stripPlay.disabled = !canControl;
    this.stripStep.disabled = status === 'COMPLETED' || status === 'FAILED' || status === 'STALE';
    this.stripIteration.textContent = String(state?.iteration ?? 0);
    this.stripEvaluations.textContent = String(state?.evaluations ?? 0);
    this.stripBest.textContent = numberText(state?.statistics.bestFitness ?? Infinity);
    this.stripDiversity.textContent = (state?.statistics.candidateCount ?? 0) > 1
      ? numberText(state?.statistics.diversity ?? 0, 3) : 'N/A';

    this.staleBanner.classList.toggle('show', status === 'STALE');

    if (this.panelOpen && !this.setupOpen) {
      this.setText('sim-iteration', String(state?.iteration ?? 0));
      this.setText('sim-evaluations', String(state?.evaluations ?? 0));
      this.setText('sim-best', numberText(state?.statistics.bestFitness ?? Infinity));
      this.setText('sim-diversity', (state?.statistics.candidateCount ?? 0) > 1
        ? numberText(state?.statistics.diversity ?? 0, 3) : 'N/A');
      this.setText('sim-status-value', this.statusText(status, this.engine.getCompletionReason()));

      const errorNode = document.getElementById('sim-error');
      if (errorNode) {
        const error = status === 'STALE' ? null : this.engine.getErrorMessage();
        errorNode.textContent = error ?? '';
        errorNode.style.display = error ? 'block' : 'none';
      }

      const play = this.panelBody.querySelector<HTMLButtonElement>('[data-sim-action="play"]');
      if (play) {
        play.textContent = status === 'RUNNING' ? '❚❚ PAUSE' : '▶ PLAY';
        play.disabled = !canControl;
      }
      const step = this.panelBody.querySelector<HTMLButtonElement>('[data-sim-action="step"]');
      if (step) step.disabled = status === 'COMPLETED' || status === 'FAILED' || status === 'STALE';

      if (this.scrubber) {
        const size = history.size;
        this.scrubber.max = String(Math.max(0, size - 1));
        const index = viewingHistory ? (this.engine.getDisplayIndex() ?? size - 1) : size - 1;
        if (document.activeElement !== this.scrubber) this.scrubber.value = String(index);
        const snapshot = history.get(index);
        this.scrubLabel.textContent = snapshot
          ? `iter ${snapshot.iteration} / ${liveState?.iteration ?? 0}`
          : '—';
      }

      this.updateEvents();
      this.drawChart();
    }

    if (this.inspectedId) this.refreshInspector();
  }

  private setText(id: string, text: string): void {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  }

  private statusText(status: string, reason: string | null): string {
    if (status === 'COMPLETED' && reason) {
      const short: Record<string, string> = {
        'max-iterations': 'MAX ITER',
        'max-evaluations': 'MAX EVAL',
        'target-reached': 'TARGET',
        'manual-stop': 'STOPPED',
        'algorithm-termination': 'TERMINATED',
      };
      return `COMPLETED · ${short[reason] ?? reason.toUpperCase()}`;
    }
    if (status === 'FAILED') return 'FAILED';
    if (status === 'STALE') return 'STALE';
    return status;
  }

  private updateEvents(): void {
    const history = this.engine.getHistory();
    const latest = history.latest();
    if (!latest) return;
    if (latest.iteration !== this.lastEventIteration) {
      this.lastEventIteration = latest.iteration;
      if (latest.events.length > 0) {
        this.eventLog.push(...latest.events);
        if (this.eventLog.length > 30) this.eventLog = this.eventLog.slice(-30);
      }
    }
    const container = document.getElementById('sim-events');
    if (!container) return;
    const recent = this.eventLog.slice(-4).reverse();
    container.innerHTML = '';
    if (recent.length === 0) {
      container.appendChild(el('div', 'sim-note', 'No semantic events yet.'));
      return;
    }
    for (const event of recent) {
      const row = el('div', 'sim-event-row');
      row.appendChild(el('span', 'sim-event-iter', `#${event.iteration}`));
      row.appendChild(el('span', '', event.type));
      container.appendChild(row);
    }
  }

  private drawChart(force = false): void {
    const canvas = this.chartCanvas;
    if (!canvas) return;
    const data = this.engine.getTelemetry().getData();
    const latestIteration = data.iteration[data.iteration.length - 1] ?? -1;
    if (!force && latestIteration === this.lastChartIteration) return;
    this.lastChartIteration = latestIteration;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (data.iteration.length < 2) {
      ctx.fillStyle = 'rgba(170,184,198,0.6)';
      ctx.font = '600 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Awaiting iterations', W / 2, H / 2);
      return;
    }

    const padL = 60;
    const padR = 18;
    const padT = 20;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const values = [...data.bestFitness, ...data.meanFitness].filter(v => Number.isFinite(v));
    const min = Math.min(...values);
    let max = Math.max(...values);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    if (max - min < 1e-9) { max = min + 1; }

    const transform = (value: number): number => {
      if (!this.logScale) return value;
      const shifted = value - min + (max - min) * 1e-3 + 1e-12;
      return Math.log10(Math.max(1e-12, shifted));
    };

    const tMin = transform(min);
    const tMax = transform(max);
    const range = (tMax - tMin) || 1;
    const iterationMin = data.iteration[0];
    const iterationMax = data.iteration[data.iteration.length - 1];
    const iterRange = (iterationMax - iterationMin) || 1;

    const xOf = (iteration: number) => padL + ((iteration - iterationMin) / iterRange) * plotW;
    const yOf = (value: number) => padT + (1 - (transform(value) - tMin) / range) * plotH;

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = padT + (g / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
    }

    const drawSeries = (series: number[], color: string, width: number): void => {
      ctx.beginPath();
      for (let i = 0; i < data.iteration.length; i++) {
        const value = series[i];
        if (!Number.isFinite(value)) continue;
        const x = xOf(data.iteration[i]);
        const y = yOf(value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    drawSeries(data.meanFitness, 'rgba(111,199,214,0.45)', 1.5);
    drawSeries(data.bestFitness, '#5fd6a0', 2.5);

    const best = data.bestFitness[data.bestFitness.length - 1];
    ctx.fillStyle = '#5fd6a0';
    ctx.beginPath();
    ctx.arc(xOf(iterationMax), yOf(best), 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(170,184,198,0.85)';
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.logScale ? `10^${tMax.toFixed(1)}` : numberText(max, 2), padL - 8, padT + 4);
    ctx.fillText(this.logScale ? `10^${tMin.toFixed(1)}` : numberText(min, 2), padL - 8, padT + plotH - 4);

    ctx.fillStyle = 'rgba(123,139,156,0.9)';
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`iter ${iterationMin}`, padL, H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`${iterationMax}`, padL + plotW, H - 8);

    if (this.engine.isViewingHistory()) {
      const snapshot = this.engine.getHistory().get(this.engine.getDisplayIndex() ?? 0);
      if (snapshot) {
        const x = xOf(snapshot.iteration);
        ctx.strokeStyle = 'rgba(230,162,60,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
      }
    }
  }

  dispose(): void {
    this.dockButton?.remove();
    this.panel.remove();
    this.strip.remove();
    this.inspector.remove();
    this.staleBanner.remove();
  }
}
