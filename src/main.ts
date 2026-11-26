import * as THREE from 'three';
import { OptimizationWorld, createDefaultConfig } from './core/world/OptimizationWorld';
import { SceneManager } from './rendering/SceneManager';
import { TerrainRenderer } from './rendering/TerrainRenderer';
import { GradientLayer } from './rendering/GradientLayer';
import { BasinLayer } from './rendering/BasinLayer';
import { CriticalPointLayer } from './rendering/CriticalPointLayer';
import { OasisRenderer } from './rendering/OasisRenderer';
import { DomainRenderer } from './rendering/DomainRenderer';
import { WaterRenderer } from './rendering/WaterRenderer';
import { TerrainProbe } from './interaction/TerrainProbe';
import { MeasurementTool } from './interaction/MeasurementTool';
import { CrossSectionTool } from './interaction/CrossSectionTool';
import { MarkerTool } from './interaction/MarkerTool';
import { CameraRig } from './camera/CameraRig';
import { AppUI, OverlayToggleKey } from './ui/AppUI';
import { SimulationUI } from './ui/SimulationUI';
import { SimulationEngine } from './core/simulation/SimulationEngine';
import { GenericAgentRenderer } from './rendering/GenericAgentRenderer';
import { ProbeData, ViewMode, NormalizationMode, WorldConfiguration } from './core/math/Types';
import { CrossSectionProfile } from './core/analysis/CrossSection';
import { CustomLab } from './ui/CustomLab';
import { buildChallengeObjective, ChallengeDefinition, CustomObjectiveDefinition } from './core/custom/ChallengeObjective';
import { SculptWorldDefinition, buildSculptObjective, SCULPT_PRESETS } from './core/sculpt/SculptObjective';
import { makeCustomChallenge, makeCustomObjectiveDefinition, CHALLENGE_PRESETS } from './core/custom/factory';
import { SavedCustomFunction } from './core/custom/store';
import { globalRegistry } from './core/math/CostFunction';

const DEBUG = new URLSearchParams(window.location.search).has('debug');
function dbg(...args: unknown[]): void {
  if (DEBUG) console.log('[METAZOO]', ...args);
}

class MetazooApp {
  private canvas: HTMLCanvasElement;
  private config: WorldConfiguration;
  private world: OptimizationWorld;
  private sceneManager!: SceneManager;
  private terrainRenderer!: TerrainRenderer;
  private gradientLayer!: GradientLayer;
  private basinLayer!: BasinLayer;
  private criticalPointLayer!: CriticalPointLayer;
  private oasisRenderer!: OasisRenderer;
  private domainRenderer!: DomainRenderer;
  private waterRenderer!: WaterRenderer;
  private cameraRig!: CameraRig;
  private terrainProbe!: TerrainProbe;
  private measurementTool!: MeasurementTool;
  private crossSectionTool!: CrossSectionTool;
  private markerTool!: MarkerTool;
  private ui!: AppUI;
  private crossSectionLine: THREE.Line | null = null;
  private customLab!: CustomLab;
  private currentChallenge: ChallengeDefinition | null = null;
  private currentCustomDef: CustomObjectiveDefinition | null = null;
  private currentSculpt: SculptWorldDefinition | null = null;
  private clockTime = 0;
  private clockPlaying = false;
  private clockSpeed = 1;
  private lastClockTick = 0;
  private simBar: HTMLElement | null = null;
  private clockLabel: HTMLElement | null = null;

  private simEngine!: SimulationEngine;
  private simUI!: SimulationUI;
  private agentRenderer!: GenericAgentRenderer;
  private simRebuildThrottle = 0;

  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private isMiddleDown = false;
  private isRightDown = false;
  private presentationMode = false;
  private lastViewMode: ViewMode = 'natural';
  private lastRebuildTime = 0;
  private perfFrames = 0;
  private perfLast = 0;

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.config = this.loadConfigFromURL() || createDefaultConfig();
    this.world = new OptimizationWorld(this.config);
    dbg('active function:', this.world.getFunction().definition.id, this.world.getFunction().definition.domain);

    this.initializeScene();
    this.initializeRenderers();
    this.initializeInteraction();
    this.initializeCamera();
    this.initializeUI();
    this.initializeSimulation();
    this.customLab = new CustomLab({
      buildChallenge: (def) => this.loadChallenge(def),
      buildSculpt: (def) => this.loadSculpt(def),
      editCurrent: () => this.openEditWorld(),
    });
    this.setupEventListeners();
    this.applyInitialConfig();
    this.startRenderLoop();

    dbg('terrain mesh present:', !!this.terrainRenderer.getTerrainMesh());
    dbg('camera:', this.sceneManager.getCamera().position.toArray());
    dbg('canvas size:', this.canvas.width, this.canvas.height);

    if (DEBUG) {
      document.body.classList.add('debug');
      const readout = document.createElement('div');
      readout.id = 'perf-readout';
      readout.textContent = 'measuring…';
      document.body.appendChild(readout);
      this.perfLast = performance.now();
    }

    // Deep-link presentation / QA affordances.
    const params = new URLSearchParams(window.location.search);
    window.setTimeout(() => {
      if (params.has('present')) this.ui.setPresentation(true);
      if (params.has('bare')) { this.ui.setPresentation(true); document.body.classList.add('bare'); }
      if (params.has('selector')) this.ui.openWorldModal();
      if (params.has('section')) this.ui.showCrossSection();
      if (params.has('lab')) {
        if (params.get('lab') === 'challenge') this.openMakeChallenge();
        else if (params.get('lab') === 'sculpt') this.customLab.openSculpt(this.currentSculpt ?? undefined);
        else this.openCreateWorld();
      }
      if (params.has('sculpt')) {
        const preset = SCULPT_PRESETS.find(p => p.id === params.get('sculpt'));
        if (preset) this.loadSculpt(preset.build());
      }
      if (params.has('sculptdemo')) {
        const k = params.get('sculptdemo');
        if (k === 'valley' || k === 'mountain' || k === 'ridge' || k === 'rotated') {
          this.customLab.openSculptDemo(k);
        }
      }
      if (params.has('preset')) {
        const preset = CHALLENGE_PRESETS.find(p => p.id === params.get('preset'));
        if (preset) this.loadChallenge(preset.build());
      }
      if (params.has('custom')) {
        const expr = params.get('custom') ?? '';
        const name = params.get('name') ?? 'Custom World';
        const parts = (params.get('domain') ?? '-5,5,-5,5').split(',').map(Number);
        const domain = {
          x1Min: parts[0] ?? -5, x1Max: parts[1] ?? 5,
          x2Min: parts[2] ?? -5, x2Max: parts[3] ?? 5,
        };
        this.loadChallenge(makeCustomChallenge(makeCustomObjectiveDefinition(expr, name, domain)));
      }
      if (params.has('probe')) {
        const x = Math.round(window.innerWidth * 0.56);
        const y = Math.round(window.innerHeight * 0.62);
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
      }
    }, 400);
  }

  private loadConfigFromURL(): WorldConfiguration | null {
    const params = new URLSearchParams(window.location.search);
    if (params.toString() === '') return null;

    const partial = OptimizationWorld.fromURLParams(params);
    const config = createDefaultConfig();
    Object.assign(config, partial);
    return config;
  }

  private initializeScene(): void {
    this.sceneManager = new SceneManager(this.canvas, this.world, this.config);
  }

  private initializeRenderers(): void {
    this.terrainRenderer = new TerrainRenderer(this.world, this.sceneManager);
    this.gradientLayer = new GradientLayer(this.world, this.sceneManager);
    this.basinLayer = new BasinLayer(this.world, this.sceneManager);
    this.criticalPointLayer = new CriticalPointLayer(this.world, this.sceneManager);
    this.oasisRenderer = new OasisRenderer(this.world, this.sceneManager);
    this.domainRenderer = new DomainRenderer(this.world, this.sceneManager);
    this.waterRenderer = new WaterRenderer(this.world, this.sceneManager);
  }

  private initializeInteraction(): void {
    this.terrainProbe = new TerrainProbe(this.world, this.sceneManager, this.sceneManager.getCamera());
    this.terrainProbe.setHoverCallback((data) => this.ui.setProbe(data));
    this.terrainProbe.setPinCallback((data) => this.measurementTool.addPoint(data));

    this.measurementTool = new MeasurementTool(this.world, this.sceneManager);
    this.measurementTool.setCallback((measurement) => {
      if (measurement) console.log('Measurement:', measurement);
    });

    this.crossSectionTool = new CrossSectionTool(this.world, this.sceneManager);
    this.crossSectionTool.setProfileCallback((profile) => {
      if (profile) this.updateCrossSectionDisplay(profile);
    });

    this.markerTool = new MarkerTool(this.world, this.sceneManager);
  }

  private initializeCamera(): void {
    this.cameraRig = new CameraRig(this.sceneManager.getCamera(), this.world);
  }

  private initializeUI(): void {
    this.ui = new AppUI(this.world, {
      onFunctionChange: (id) => this.onFunctionChange(id),
      onViewModeChange: (mode) => this.onViewModeChange(mode),
      onOverlayToggle: (key, value) => this.onOverlayToggle(key, value),
      onContourCountChange: (count) => this.onContourCountChange(count),
      onResolutionChange: (res) => this.onResolutionChange(res),
      onVerticalScaleChange: (scale) => this.onVerticalScaleChange(scale),
      onNormalizationChange: (mode) => this.onNormalizationChange(mode),
      onCameraPreset: (preset) => this.onCameraPreset(preset),
      onResetCamera: () => this.onResetCamera(),
      onFocusOptimum: () => this.onFocusOptimum(),
      onPresentationToggle: (on) => this.onPresentationToggle(on),
      onProbeEnabledChange: (on) => this.terrainProbe.setEnabled(on),
      onCrossSectionChange: (profile) => this.setCrossSectionLine(profile),
      onCreateWorld: () => this.openCreateWorld(),
      onMakeChallenge: () => this.openMakeChallenge(),
      onEditWorld: () => this.openEditWorld(),
      onLoadSavedFunction: (saved) => this.loadSavedFunction(saved),
      onLoadChallenge: (ch) => this.loadChallenge(ch),
    });
  }
  private initializeSimulation(): void {
    this.simEngine = new SimulationEngine(this.world, {
      onWorldTimeChanged: (time) => this.onWorldTimeChanged(time),
      onStateChange: () => this.onSimStateChange(),
    });
    this.agentRenderer = new GenericAgentRenderer(this.world, this.sceneManager);
    this.agentRenderer.setPickCallback((candidate) => this.simUI.showCandidate(candidate));
    this.simUI = new SimulationUI(this.simEngine, {
      onBeforeOpen: () => this.ui?.closeTool(),
    });
    this.handleDeepLinkSimParams();
  }

  private onWorldTimeChanged(time: number): void {
    this.world.setSimTime(time);
    const now = performance.now();
    if (now - this.simRebuildThrottle > 150) {
      this.simRebuildThrottle = now;
      this.rebuildAll();
    }
  }

  private onSimStateChange(): void {
    this.simUI?.update(true);
  }

  private handleDeepLinkSimParams(): void {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('sim')) {
      if (params.has('simpane')) this.simUI.openPanel();
      return;
    }

    const challengeId = params.get('challenge');
    if (challengeId) {
      const preset = CHALLENGE_PRESETS.find(p => p.id === challengeId);
      if (preset) this.loadChallenge(preset.build());
    }

    const optimizerId = params.get('sim')!;
    const seed = parseInt(params.get('simseed') || '42', 10);
    const populationSize = parseInt(params.get('simpop') || '30', 10);
    const maxEvaluations = parseInt(params.get('simevals') || '5000', 10);
    const maxIterations = parseInt(params.get('simiter') || '500', 10);
    const boundaryPolicy = (params.get('simboundary') || 'reflect') as import('./core/simulation/types').BoundaryPolicy;
    const speed = parseFloat(params.get('simspeed') || '1');
    const autoRun = params.has('simrun');

    this.simEngine.initialize({
      optimizerId,
      seed,
      populationSize,
      maxEvaluations,
      maxIterations,
      boundaryPolicy,
      optimizerParameters: optimizerId === 'gradient-descent' ? { learningRate: 0.08, maxStepFraction: 0.12 } : {},
    });
    if (speed !== 1) this.simEngine.setPlaybackSpeed(speed);

    const steps = parseInt(params.get('simsteps') || '0', 10);
    for (let i = 0; i < steps; i++) {
      this.simEngine.stepOnce();
      if (!this.simEngine.getRunConfiguration()) break;
    }
    if (steps > 0) this.rebuildAll();

    this.simUI.adoptExternalRun();

    const inspect = parseInt(params.get('siminspect') || '-1', 10);
    if (inspect >= 0) this.simUI.showCandidateIndex(inspect);

    const scrub = parseInt(params.get('simscrub') || '-1', 10);
    if (scrub >= 0) this.simEngine.scrubTo(scrub);
    if (params.has('simreplay')) this.simEngine.startReplay();

    if (params.has('simstale')) {
      this.onFunctionChange('rastrigin');
      this.simEngine.notifyWorldChanged();
    }

    if (params.has('simpane')) this.simUI.openPanel();

    if (autoRun) {
      this.simEngine.play();
    }
  }

  // ------------------------------------------------------------ custom worlds
  private openCreateWorld(): void {
    this.customLab.openCreateWorld(this.currentCustomDef ?? undefined);
  }

  private openEditWorld(): void {
    if (this.currentSculpt) this.customLab.openSculpt(this.currentSculpt);
    else this.customLab.openCreateWorld(this.currentCustomDef ?? undefined);
  }

  private openMakeChallenge(): void {
    const base = this.currentBase();
    if (base) this.customLab.openChallengeBuilder(base.base, base.label);
    else this.customLab.openChallengeBuilder({ kind: 'builtin', id: 'sphere' }, 'Sphere');
  }

  private currentBase(): { base: ChallengeDefinition['base']; label: string } | null {
    if (this.currentCustomDef) {
      return { base: { kind: 'custom', definition: this.currentCustomDef }, label: this.currentCustomDef.name };
    }
    if (this.currentChallenge) {
      const b = this.currentChallenge.base;
      return { base: b, label: b.kind === 'custom' ? b.definition.name : b.id };
    }
    const fn = this.world.getFunction();
    if (globalRegistry.has(fn.definition.id)) {
      return { base: { kind: 'builtin', id: fn.definition.id }, label: fn.definition.shortName || fn.definition.name };
    }
    return null;
  }

  private loadSavedFunction(saved: SavedCustomFunction): void {
    const ch = makeCustomChallenge(saved.definition);
    this.loadChallenge(ch);
  }

  private loadSculpt(def: SculptWorldDefinition): void {
    const built = buildSculptObjective(def);
    this.currentChallenge = null;
    this.currentSculpt = def;
    this.currentCustomDef = def.base.kind === 'custom' ? def.base.definition : null;

    this.world.setObjective(built.objective, built.domain as unknown as WorldConfiguration['domain']);
    this.config.verticalScale = 1.6;
    this.world.setVerticalScale(1.6);

    this.clockTime = 0;
    this.clockPlaying = false;
    this.world.setSimTime(0);

    this.applyViewMode(this.config.viewMode);
    this.rebuildAll();
    this.cameraRig.setFunctionPreset('custom', true);
    this.ui?.syncFromConfig();
    this.ui?.updateFunctionInfo();
    this.setupSimBar(false);
    this.simEngine?.notifyWorldChanged();
  }

  private loadChallenge(def: ChallengeDefinition): void {
    const built = buildChallengeObjective(def, 0);
    this.currentChallenge = def;
    this.currentCustomDef = def.base.kind === 'custom' ? def.base.definition : null;

    this.world.setObjective(built.objective, built.domain as unknown as WorldConfiguration['domain']);

    const viewId = def.base.kind === 'builtin' ? def.base.id : 'custom';
    const view = CameraRig.getFunctionView(viewId);
    this.config.verticalScale = view.verticalScale;
    this.world.setVerticalScale(view.verticalScale);

    this.clockTime = 0;
    this.clockPlaying = false;
    this.world.setSimTime(0);

    this.applyViewMode(this.config.viewMode);
    this.rebuildAll();
    this.cameraRig.setFunctionPreset(viewId, true);

    this.ui?.syncFromConfig();
    this.ui?.updateFunctionInfo();
    this.setupSimBar(def.dynamics?.enabled === true);
    this.simEngine?.notifyWorldChanged();
  }

  private setupSimBar(active: boolean): void {
    if (!active) {
      this.simBar?.classList.remove('show');
      this.clockPlaying = false;
      return;
    }
    if (!this.simBar) {
      const bar = document.createElement('div');
      bar.id = 'sim-clock';

      const play = document.createElement('button');
      play.textContent = '▶ Play';
      play.addEventListener('click', () => {
        this.clockPlaying = !this.clockPlaying;
        play.textContent = this.clockPlaying ? '❚❚ Pause' : '▶ Play';
      });

      const step = document.createElement('button');
      step.textContent = 'Step';
      step.addEventListener('click', () => this.stepClock(0.2));

      const reset = document.createElement('button');
      reset.textContent = 'Reset';
      reset.addEventListener('click', () => this.resetClock());

      const speed = document.createElement('button');
      speed.textContent = '1×';
      speed.addEventListener('click', () => {
        this.clockSpeed = this.clockSpeed === 0.5 ? 1 : this.clockSpeed === 1 ? 2 : 0.5;
        speed.textContent = `${this.clockSpeed}×`;
      });

      const clock = document.createElement('span');
      clock.className = 'clock';
      clock.textContent = 't 0.00';
      this.clockLabel = clock;

      bar.appendChild(play);
      bar.appendChild(step);
      bar.appendChild(reset);
      bar.appendChild(speed);
      bar.appendChild(clock);
      document.body.appendChild(bar);
      this.simBar = bar;
    }
    this.simBar.classList.add('show');
  }

  private stepClock(dt: number): void {
    this.clockTime += dt * this.clockSpeed;
    this.world.setSimTime(this.clockTime);
    this.rebuildAll();
    this.updateClockLabel();
  }

  private resetClock(): void {
    this.clockTime = 0;
    this.clockPlaying = false;
    this.world.setSimTime(0);
    this.rebuildAll();
    this.updateClockLabel();
    if (this.simBar) {
      const play = this.simBar.querySelector('button');
      if (play) play.textContent = '▶ Play';
    }
  }

  private updateClockLabel(): void {
    if (this.clockLabel) this.clockLabel.textContent = `t ${this.clockTime.toFixed(2)}`;
  }

  private setCrossSectionLine(profile: CrossSectionProfile | null): void {
    if (!profile) {
      if (this.crossSectionLine) this.crossSectionLine.visible = false;
      return;
    }

    const n = profile.samples.length;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = profile.samples[i];
      positions[i * 3] = s.wx;
      positions[i * 3 + 1] = s.wy + 0.35;
      positions[i * 3 + 2] = s.wz;
    }

    if (!this.crossSectionLine) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({ color: 0x6fe0ff, transparent: true, opacity: 0.95 });
      this.crossSectionLine = new THREE.Line(geo, mat);
      this.crossSectionLine.renderOrder = 6;
      this.sceneManager.getOverlayGroup().add(this.crossSectionLine);
    } else {
      const geo = this.crossSectionLine.geometry;
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.computeBoundingSphere();
      this.crossSectionLine.visible = true;
    }

    this.config.overlays.crossSection.enabled = true;
    this.config.overlays.crossSection.mode = profile.mode === 'custom' ? 'custom' : (profile.mode === 'x2' ? 'z' : 'x');
    this.config.overlays.crossSection.position = profile.position * 2 - 1;
  }

  private onFocusOptimum(): void {
    this.cameraRig.setPreset('minimum-focus' as any);
  }

  private onPresentationToggle(on: boolean): void {
    this.presentationMode = on;
    this.terrainProbe.setEnabled(!on);
    if (on) this.ui?.setProbe(null);
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
    window.addEventListener('resize', this.onResize.bind(this));
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.target !== this.canvas) return;

    this.isDragging = true;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;
    this.isMiddleDown = event.button === 1;
    this.isRightDown = event.button === 2;

    if (event.button === 0 && !this.presentationMode) {
      if (this.agentRenderer.tryPick(event)) {
        event.preventDefault();
        return;
      }
      this.terrainProbe.handleMouseMove(event);
    } else if (event.button === 2) {
      this.terrainProbe.handleClick(event);
    }

    event.preventDefault();
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isDragging) {
      this.terrainProbe.handleMouseMove(event);
      return;
    }

    const dx = event.clientX - this.lastMouseX;
    const dy = event.clientY - this.lastMouseY;
    this.lastMouseX = event.clientX;
    this.lastMouseY = event.clientY;

    if (this.isMiddleDown || (this.isRightDown && event.shiftKey)) {
      this.cameraRig.pan(dx * 0.01, dy * 0.01);
    } else if (this.isRightDown) {
      this.cameraRig.orbit(dx * 0.005, dy * 0.005);
    }

    event.preventDefault();
  }

  private onMouseUp(event: MouseEvent): void {
    this.isDragging = false;
    this.isMiddleDown = false;
    this.isRightDown = false;
  }

  private onWheel(event: WheelEvent): void {
    this.cameraRig.zoom(event.deltaY * 0.001);
    event.preventDefault();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;

    switch (event.key) {
      case ' ':
      case 'p':
      case 'h':
        this.ui.togglePresentation();
        return;
      case '1': this.onViewModeChange('natural'); return;
      case '2': this.onViewModeChange('scientific'); return;
      case '3': this.onViewModeChange('topographic'); return;
      case 'o': this.cameraRig.setPreset('overview' as any); return;
      case 'f': this.onFocusOptimum(); return;
      case 'c': this.onOverlayToggle('contours', !this.config.overlays.contours); this.ui.syncFromConfig(); return;
      case 'g': this.onOverlayToggle('gradientField', !this.config.overlays.gradientField); this.ui.syncFromConfig(); return;
      case 'b': this.onOverlayToggle('basins', !this.config.overlays.basins); this.ui.syncFromConfig(); return;
      case 'm': this.onOverlayToggle('localMinima', !this.config.overlays.criticalPoints.localMinima); this.ui.syncFromConfig(); return;
      case 'Escape':
        if (this.presentationMode) { this.ui.togglePresentation(); return; }
        this.ui.setProbe(null);
        this.measurementTool.clear();
        return;
      case 'r':
        this.rebuildAll();
        return;
    }
  }

  private onKeyUp(_event: KeyboardEvent): void {}

  private onResize(): void {
    this.sceneManager.getRenderer().setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
    this.sceneManager.getCamera().aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.sceneManager.getCamera().updateProjectionMatrix();
  }

  private applyInitialConfig(): void {
    const view = CameraRig.getFunctionView(this.config.functionId);
    this.config.verticalScale = view.verticalScale;
    this.world.setVerticalScale(view.verticalScale);
    this.lastViewMode = this.config.viewMode;
    this.applyViewMode(this.config.viewMode);
    this.rebuildAll();
    this.cameraRig.setFunctionPreset(this.config.functionId, false);
  }

  private applyOverlayConfig(): void {
    const o = this.config.overlays;
    this.basinLayer.setVisible(o.basins);
    this.basinLayer.setBoundariesVisible(o.basinBoundaries);
    this.gradientLayer.setVisible(o.gradientField);
    this.criticalPointLayer.setFlags({
      globalMinima: true,
      localMinima: o.criticalPoints.localMinima,
      localMaxima: o.criticalPoints.localMaxima,
      saddlePoints: o.criticalPoints.saddlePoints,
    });
    this.terrainRenderer.setContourParams(o.contours, this.config.contourCount, 0.08, 0.4);
    this.terrainRenderer.setCurvatureOverlay(o.curvature);
  }

  private onFunctionChange(id: string): void {
    const fn = this.world.getFunction();
    if (fn && fn.definition.id === id) return;

    this.currentChallenge = null;
    this.currentCustomDef = null;
    this.currentSculpt = null;
    this.setupSimBar(false);

    this.world.setFunction(id);
    const def = this.world.getFunction().definition;
    this.config.domain = { ...def.domain };
    this.world.setDomain(def.domain);

    const view = CameraRig.getFunctionView(id);
    this.config.verticalScale = view.verticalScale;
    this.world.setVerticalScale(view.verticalScale);

    this.config.overlays = createDefaultConfig().overlays;
    this.applyViewMode(this.config.viewMode);

    this.rebuildAll();
    this.cameraRig.setFunctionPreset(id, true);
    this.ui?.syncFromConfig();
    this.ui?.updateFunctionInfo();
    this.simEngine?.notifyWorldChanged();
  }

  private onViewModeChange(mode: ViewMode): void {
    const previous = this.lastViewMode;
    this.lastViewMode = mode;
    this.config.viewMode = mode;
    this.applyViewMode(mode);
    this.rebuildAll();

    // Preserve the user's camera across Natural <-> Scientific; topographic
    // switches to a map view, and leaving topographic restores the benchmark view.
    if (mode === 'topographic') {
      this.cameraRig.setPreset('top-down');
    } else if (previous === 'topographic') {
      this.cameraRig.setFunctionPreset(this.config.functionId, true);
    }

    this.ui?.syncFromConfig();
  }

  private applyViewMode(mode: ViewMode): void {
    const baseOverlays = createDefaultConfig().overlays;
    this.config.viewMode = mode;

    switch (mode) {
      case 'natural': {
        this.config.overlays = {
          ...baseOverlays,
          contours: false,
          basins: false,
          basinBoundaries: false,
          gradientField: false,
          curvature: false,
          criticalPoints: {
            globalMinima: true,
            localMinima: false,
            localMaxima: false,
            saddlePoints: false,
          },
        };
        break;
      }
      case 'scientific': {
        this.config.overlays = {
          ...baseOverlays,
          contours: true,
          basins: false,
          basinBoundaries: false,
          gradientField: false,
          curvature: false,
          criticalPoints: {
            globalMinima: true,
            localMinima: true,
            localMaxima: false,
            saddlePoints: false,
          },
        };
        break;
      }
      case 'topographic': {
        this.config.overlays = {
          ...baseOverlays,
          contours: true,
          basins: false,
          basinBoundaries: true,
          gradientField: false,
          curvature: false,
          criticalPoints: {
            globalMinima: true,
            localMinima: false,
            localMaxima: false,
            saddlePoints: false,
          },
        };
        break;
      }
    }

    this.config.contourCount = mode === 'scientific' ? 16 : 12;
  }

  private onOverlayToggle(key: OverlayToggleKey, value: boolean): void {
    switch (key) {
      case 'contours':
        this.config.overlays.contours = value;
        this.terrainRenderer.setContourParams(value, this.config.contourCount, 0.09, 0.42);
        break;
      case 'basins':
        this.config.overlays.basins = value;
        this.basinLayer.setVisible(value);
        if (value) this.basinLayer.rebuild();
        break;
      case 'basinBoundaries':
        this.config.overlays.basinBoundaries = value;
        this.basinLayer.setBoundariesVisible(value);
        if (value) this.basinLayer.rebuild();
        break;
      case 'gradientField':
        this.config.overlays.gradientField = value;
        this.gradientLayer.setVisible(value);
        break;
      case 'curvature':
        this.config.overlays.curvature = value;
        this.terrainRenderer.setCurvatureOverlay(value);
        break;
      case 'localMinima':
        this.config.overlays.criticalPoints.localMinima = value;
        this.criticalPointLayer.setVisibility('localMinima', value);
        break;
      case 'localMaxima':
        this.config.overlays.criticalPoints.localMaxima = value;
        this.criticalPointLayer.setVisibility('localMaxima', value);
        break;
      case 'saddlePoints':
        this.config.overlays.criticalPoints.saddlePoints = value;
        this.criticalPointLayer.setVisibility('saddlePoints', value);
        break;
    }
  }

  private onContourCountChange(count: number): void {
    this.config.contourCount = count;
    this.terrainRenderer.setContourParams(this.config.overlays.contours, count, 0.09, 0.42);
  }

  private onResolutionChange(res: number): void {
    this.config.resolution = res;
    this.world.setResolution(res);
    this.rebuildAll();
    this.ui?.syncFromConfig();
  }

  private onVerticalScaleChange(scale: number): void {
    this.config.verticalScale = scale;
    this.world.setVerticalScale(scale);
    this.rebuildAll();
  }

  private onNormalizationChange(mode: NormalizationMode): void {
    this.config.normalizationMode = mode;
    this.world.setNormalizationMode(mode);
    this.rebuildAll();
  }

  private onCameraPreset(preset: string): void {
    this.config.cameraPreset = preset as any;
    this.cameraRig.setPreset(preset as any);
  }

  private onResetCamera(): void {
    this.cameraRig.setFunctionPreset(this.config.functionId, false);
  }

  private rebuildAll(): void {
    const startTime = performance.now();

    this.applyOverlayConfig();

    this.terrainRenderer.rebuild();
    this.terrainRenderer.applyOverlays();
    this.gradientLayer.rebuild();
    this.basinLayer.rebuild();
    this.criticalPointLayer.rebuild();
    this.oasisRenderer.rebuild();
    this.domainRenderer.rebuild();
    this.domainRenderer.setMode(this.config.viewMode);

    this.lastRebuildTime = performance.now() - startTime;
  }

  private updateCrossSectionDisplay(_profile: any): void {}

  private startRenderLoop(): void {
    this.sceneManager.startRenderLoop((deltaTime) => this.update(deltaTime));
  }

  private update(deltaTime: number): void {
    this.cameraRig.update(deltaTime);
    this.terrainRenderer.update(deltaTime);
    this.oasisRenderer.update(deltaTime);
    this.criticalPointLayer.updateBeacons(deltaTime);
    this.waterRenderer.update(deltaTime);

    if (this.simEngine) {
      this.simEngine.advance(deltaTime);
      this.agentRenderer.update(this.simEngine.getRenderFrame());
      this.simUI.update();
    }

    if (!this.simEngine?.hasRun() && this.clockPlaying && this.currentChallenge?.dynamics?.enabled) {
      this.clockTime += Math.min(deltaTime, 0.1) * this.clockSpeed;
      const now = performance.now();
      if (now - this.lastClockTick > 150) {
        this.world.setSimTime(this.clockTime);
        this.rebuildAll();
        this.updateClockLabel();
        this.lastClockTick = now;
      }
    }

    if (DEBUG) {
      this.perfFrames++;
      const now = performance.now();
      if (now - this.perfLast >= 500) {
        const fps = this.perfFrames * 1000 / (now - this.perfLast);
        const info = this.sceneManager.getRenderer().info.render;
        const el = document.getElementById('perf-readout');
        if (el) {
          el.textContent = `FPS ${fps.toFixed(0)} · calls ${info.calls} · tris ${info.triangles} · ${this.config.resolution}²`;
        }
        this.perfFrames = 0;
        this.perfLast = now;
      }
    }
  }

  dispose(): void {
    this.sceneManager.stopRenderLoop();

    this.terrainProbe.dispose();
    this.measurementTool.dispose();
    this.crossSectionTool.dispose();
    this.markerTool.dispose();

    this.terrainRenderer.dispose();
    this.gradientLayer.dispose();
    this.basinLayer.dispose();
    this.criticalPointLayer.dispose();
    this.oasisRenderer.dispose();
    this.domainRenderer.dispose();
    this.waterRenderer.dispose();

    if (this.crossSectionLine) {
      this.sceneManager.getOverlayGroup().remove(this.crossSectionLine);
      this.crossSectionLine.geometry.dispose();
      (this.crossSectionLine.material as THREE.Material).dispose();
      this.crossSectionLine = null;
    }

    this.sceneManager.dispose();

    this.ui.dispose();
    this.simUI?.dispose();
    this.agentRenderer?.dispose();
    this.simEngine?.dispose();
    this.simBar?.remove();
  }
}

declare global {
  interface Window {
    MetazooApp: typeof MetazooApp;
  }
}

window.MetazooApp = MetazooApp;

function removeBootStatus(): void {
  document.getElementById('boot-status')?.remove();
}

function showFatalError(stage: string, error: unknown, config?: WorldConfiguration): void {
  console.error('[METAZOO] Initialization failed at', stage, error);
  removeBootStatus();

  const detail = error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error);
  const panel = document.createElement('div');
  panel.id = 'fatal-error';
  panel.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999', 'display:flex',
    'align-items:center', 'justify-content:center',
    'background:rgba(9,13,18,0.94)', 'padding:24px',
    'font-family:JetBrains Mono, monospace', 'color:#dfe7ef',
  ].join(';');
  panel.innerHTML = `
    <div style="max-width:680px;border:1px solid #d9695f;border-radius:12px;padding:20px;background:#131a22">
      <div style="color:#d9695f;font-weight:700;letter-spacing:.1em;margin-bottom:10px">UNABLE TO BUILD LANDSCAPE</div>
      <div style="font-size:12px;color:#8ea0b3;margin-bottom:10px">Stage: <b style="color:#dfe7ef">${stage}</b>${
        config ? ` &nbsp;·&nbsp; Function: <b style="color:#dfe7ef">${config.functionId}</b> &nbsp;·&nbsp; Resolution: <b style="color:#dfe7ef">${config.resolution}</b>` : ''
      }</div>
      <pre style="white-space:pre-wrap;font-size:11px;color:#b9c6d4;max-height:50vh;overflow:auto;margin:0">${detail}</pre>
      <div style="font-size:11px;color:#8ea0b3;margin-top:12px">Open diagnostics (append <code>?debug=1</code>) for detailed logs.</div>
    </div>`;
  document.body.appendChild(panel);
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const app = new MetazooApp();
    (window as unknown as { metazoo?: MetazooApp }).metazoo = app;
    removeBootStatus();
  } catch (error) {
    showFatalError('Application initialization', error);
  }
});

export { MetazooApp };