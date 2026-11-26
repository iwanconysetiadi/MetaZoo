import * as dat from 'dat.gui';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { WorldConfiguration, CameraPreset, RESOLUTION_LEVELS } from '../core/math/Types';
import { CAMERA_PRESETS } from '../camera/CameraPresets';
import { globalRegistry } from '../core/math/CostFunction';

export class ControlPanel {
  private gui: dat.GUI;
  private world: OptimizationWorld;
  private config: WorldConfiguration;
  private onConfigChange: (config: WorldConfiguration) => void;
  private folders: Map<string, dat.GUI> = new Map();
  private controllers: Map<string, dat.GUIController> = new Map();

  constructor(world: OptimizationWorld, onConfigChange: (config: WorldConfiguration) => void) {
    this.world = world;
    this.config = world.getConfig();
    this.onConfigChange = onConfigChange;
    this.gui = new dat.GUI({ width: 320, autoPlace: false });
    this.gui.domElement.id = 'control-panel';
    document.body.appendChild(this.gui.domElement);
    this.buildUI();
  }

  private buildUI(): void {
    this.buildFunctionFolder();
    this.buildVisualizationFolder();
    this.buildAnalysisFolder();
    this.buildCameraFolder();
    this.buildQualityFolder();
    this.buildPresetFolder();
  }

  private buildFunctionFolder(): void {
    const folder = this.gui.addFolder('Function');
    this.folders.set('function', folder);

    const functions = globalRegistry.getAllDefinitions();
    const functionOptions: Record<string, string> = {};
    functions.forEach(f => { functionOptions[f.name] = f.id; });

    const fnController = folder.add(this.config, 'functionId', functionOptions)
      .name('Benchmark')
      .onChange((value: string) => {
        this.config.functionId = value;
        this.world.setFunction(value);
        this.onConfigChange(this.config);
        this.updateDomainFolder();
      });
    this.controllers.set('functionId', fnController);

    const domainFolder = folder.addFolder('Domain');
    this.folders.set('domain', domainFolder);
    this.buildDomainControls(domainFolder);

    const resolutionController = folder.add(this.config, 'resolution', 
      RESOLUTION_LEVELS.map(l => l.resolution))
      .name('Resolution')
      .onChange((value: number) => {
        this.config.resolution = value;
        this.world.setResolution(value);
        this.onConfigChange(this.config);
      });
    this.controllers.set('resolution', resolutionController);

    const verticalController = folder.add(this.config, 'verticalScale', 0.1, 5, 0.1)
      .name('Vertical Scale')
      .onChange((value: number) => {
        this.config.verticalScale = value;
        this.world.setVerticalScale(value);
        this.onConfigChange(this.config);
      });
    this.controllers.set('verticalScale', verticalController);

    folder.open();
  }

  private buildDomainControls(folder: dat.GUI): void {
    const domain = this.config.domain;
    const updateDomain = () => {
      this.world.setDomain(this.config.domain);
      this.onConfigChange(this.config);
    };

    folder.add(domain, 'x1Min', -100, 100, 0.1).name('x₁ Min').onChange(updateDomain);
    folder.add(domain, 'x1Max', -100, 100, 0.1).name('x₁ Max').onChange(updateDomain);
    folder.add(domain, 'x2Min', -100, 100, 0.1).name('x₂ Min').onChange(updateDomain);
    folder.add(domain, 'x2Max', -100, 100, 0.1).name('x₂ Max').onChange(updateDomain);
  }

  private updateDomainFolder(): void {
    const folder = this.folders.get('domain');
    if (folder) {
      folder.destroy();
      const newFolder = this.folders.get('function')!.addFolder('Domain');
      this.folders.set('domain', newFolder);
      this.buildDomainControls(newFolder);
      newFolder.open();
    }
  }

  private buildVisualizationFolder(): void {
    const folder = this.gui.addFolder('Visualization');
    this.folders.set('visualization', folder);

    const normModes: Record<string, string> = {
      'Linear': 'linear',
      'Logarithmic': 'log',
      'Quantile': 'quantile',
      'Clamped Percentile': 'clamped-percentile',
    };
    folder.add(this.config, 'normalizationMode', normModes).name('Normalization')
      .onChange((v: string) => { this.config.normalizationMode = v as any; this.world.setNormalizationMode(v as any); this.onConfigChange(this.config); });

    const heightModes: Record<string, string> = {
      'Raw': 'raw',
      'Linear': 'linear',
      'Log': 'log',
      'Quantile': 'quantile',
      'Clamped Percentile': 'clamped-percentile',
    };
    folder.add(this.config, 'heightMapping', heightModes).name('Height Mapping')
      .onChange((v: string) => { this.config.heightMapping = v as any; this.onConfigChange(this.config); });

    const contourFolder = folder.addFolder('Contours');
    this.buildContourControls(contourFolder);

    folder.open();
  }

  private buildContourControls(folder: dat.GUI): void {
    const modes: Record<string, string> = { 'Linear': 'linear', 'Logarithmic': 'log', 'Quantile': 'quantile' };
    folder.add(this.config, 'contourMode', modes).name('Mode')
      .onChange((v: string) => { this.config.contourMode = v as any; this.onConfigChange(this.config); });
    folder.add(this.config, 'contourCount', 5, 50, 1).name('Count')
      .onChange((v: number) => { this.config.contourCount = v; this.onConfigChange(this.config); });
    folder.add(this.config.overlays, 'contours').name('Enabled')
      .onChange((v: boolean) => { this.config.overlays.contours = v; this.onConfigChange(this.config); });
  }

  private buildAnalysisFolder(): void {
    const folder = this.gui.addFolder('Analysis Overlays');
    this.folders.set('analysis', folder);

    folder.add(this.config.overlays, 'gradientField').name('Gradient Field')
      .onChange((v: boolean) => { this.config.overlays.gradientField = v; this.onConfigChange(this.config); });
    
    const gradFolder = folder.addFolder('Gradient Settings');
    gradFolder.add(this.config.overlays, 'gradientField').name('Enabled'); // placeholder for density/scale
    
    folder.add(this.config.overlays, 'basins').name('Attraction Basins')
      .onChange((v: boolean) => { this.config.overlays.basins = v; this.onConfigChange(this.config); });
    folder.add(this.config.overlays, 'basinBoundaries').name('Basin Boundaries')
      .onChange((v: boolean) => { this.config.overlays.basinBoundaries = v; this.onConfigChange(this.config); });
    folder.add(this.config.overlays, 'gradientFlow').name('Gradient Flow')
      .onChange((v: boolean) => { this.config.overlays.gradientFlow = v; this.onConfigChange(this.config); });
    folder.add(this.config.overlays, 'curvature').name('Curvature')
      .onChange((v: boolean) => { this.config.overlays.curvature = v; this.onConfigChange(this.config); });

    const cpFolder = folder.addFolder('Critical Points');
    cpFolder.add(this.config.overlays.criticalPoints, 'globalMinima').name('Global Minima')
      .onChange((v: boolean) => { this.config.overlays.criticalPoints.globalMinima = v; this.onConfigChange(this.config); });
    cpFolder.add(this.config.overlays.criticalPoints, 'localMinima').name('Local Minima')
      .onChange((v: boolean) => { this.config.overlays.criticalPoints.localMinima = v; this.onConfigChange(this.config); });
    cpFolder.add(this.config.overlays.criticalPoints, 'localMaxima').name('Local Maxima')
      .onChange((v: boolean) => { this.config.overlays.criticalPoints.localMaxima = v; this.onConfigChange(this.config); });
    cpFolder.add(this.config.overlays.criticalPoints, 'saddlePoints').name('Saddle Points')
      .onChange((v: boolean) => { this.config.overlays.criticalPoints.saddlePoints = v; this.onConfigChange(this.config); });

    const csFolder = folder.addFolder('Cross-Section');
    csFolder.add(this.config.overlays.crossSection, 'enabled').name('Enabled')
      .onChange((v: boolean) => { this.config.overlays.crossSection.enabled = v; this.onConfigChange(this.config); });
    const csModes: Record<string, string> = { 'X Slice': 'x', 'Z Slice': 'z', 'Custom Line': 'custom' };
    csFolder.add(this.config.overlays.crossSection, 'mode', csModes).name('Mode')
      .onChange((v: string) => { this.config.overlays.crossSection.mode = v as any; this.onConfigChange(this.config); });
    csFolder.add(this.config.overlays.crossSection, 'position', -1, 1, 0.01).name('Position')
      .onChange((v: number) => { this.config.overlays.crossSection.position = v; this.onConfigChange(this.config); });

    folder.open();
  }

  private buildCameraFolder(): void {
    const folder = this.gui.addFolder('Camera');
    this.folders.set('camera', folder);

    const presetOptions: Record<string, string> = {};
    CAMERA_PRESETS.forEach(p => { presetOptions[p.name] = p.id; });

    folder.add(this.config, 'cameraPreset', presetOptions).name('Preset')
      .onChange((v: string) => { this.config.cameraPreset = v as CameraPreset; this.onConfigChange(this.config); });

    folder.open();
  }

  private buildQualityFolder(): void {
    const folder = this.gui.addFolder('Quality');
    this.folders.set('quality', folder);

    const qualityOptions: Record<string, string> = {
      'Performance': 'performance',
      'Balanced': 'balanced',
      'Presentation': 'presentation',
      'Ultra': 'ultra',
    };
    folder.add(this.config, 'visualQuality', qualityOptions).name('Preset')
      .onChange((v: string) => { this.config.visualQuality = v as any; this.onConfigChange(this.config); });

    folder.open();
  }

  private buildPresetFolder(): void {
    const folder = this.gui.addFolder('Scientific Presets');
    this.folders.set('presets', folder);

    const presets = {
      'Convex Bowl (Sphere)': () => this.applyPreset('sphere'),
      'Local Trap Field (Rastrigin)': () => this.applyPreset('rastrigin'),
      'Central Basin (Ackley)': () => this.applyPreset('ackley'),
      'Narrow Canyon (Rosenbrock)': () => this.applyPreset('rosenbrock'),
      'Four Oases (Himmelblau)': () => this.applyPreset('himmelblau'),
      'Extreme Multimodal (Schwefel)': () => this.applyPreset('schwefel'),
    };

    Object.entries(presets).forEach(([name, fn]) => {
      folder.add({ [name]: fn }, name);
    });

    folder.add({ 'Share URL': () => this.shareURL() }, 'Share URL');
    folder.add({ 'Load from URL': () => this.loadFromURL() }, 'Load from URL');

    folder.open();
  }

  private applyPreset(functionId: string): void {
    const fn = globalRegistry.get(functionId);
    if (!fn) return;

    this.config.functionId = functionId;
    this.world.setFunction(functionId);
    
    const domain = fn.definition.domain;
    this.config.domain = { ...domain };
    this.world.setDomain(domain);

    const presetConfigs: Record<string, Partial<WorldConfiguration>> = {
      sphere: { cameraPreset: 'top-down', overlays: { ...this.config.overlays, contours: true, criticalPoints: { ...this.config.overlays.criticalPoints, globalMinima: true } } },
      rastrigin: { cameraPreset: 'orbit', overlays: { ...this.config.overlays, contours: true, basins: true, criticalPoints: { ...this.config.overlays.criticalPoints, globalMinima: true, localMinima: true } } },
      ackley: { cameraPreset: 'minimum-focus', overlays: { ...this.config.overlays, contours: true, basins: true, criticalPoints: { ...this.config.overlays.criticalPoints, globalMinima: true } } },
      rosenbrock: { cameraPreset: 'valley-view', overlays: { ...this.config.overlays, contours: true, gradientField: true, criticalPoints: { ...this.config.overlays.criticalPoints, globalMinima: true } } },
      himmelblau: { cameraPreset: 'top-down', overlays: { ...this.config.overlays, contours: true, basins: true, basinBoundaries: true, criticalPoints: { ...this.config.overlays.criticalPoints, globalMinima: true } } },
      schwefel: { cameraPreset: 'orbit', overlays: { ...this.config.overlays, contours: true, basins: true, criticalPoints: { ...this.config.overlays.criticalPoints, globalMinima: true, localMinima: true } } },
    };

    if (presetConfigs[functionId]) {
      Object.assign(this.config, presetConfigs[functionId]);
    }

    this.onConfigChange(this.config);
    this.updateControllers();
  }

  private updateControllers(): void {
    this.controllers.forEach((controller, key) => {
      controller.updateDisplay();
    });
  }

  private shareURL(): void {
    const url = window.location.origin + window.location.pathname + '?' + this.world.toURLParams();
    navigator.clipboard.writeText(url).then(() => {
      console.log('URL copied to clipboard:', url);
    });
  }

  private loadFromURL(): void {
    const params = new URLSearchParams(window.location.search);
    const partialConfig = OptimizationWorld.fromURLParams(params);
    Object.assign(this.config, partialConfig);
    this.world.setFunction(this.config.functionId!);
    this.world.setResolution(this.config.resolution!);
    this.world.setVerticalScale(this.config.verticalScale!);
    this.world.setNormalizationMode(this.config.normalizationMode!);
    this.world.setDomain(this.config.domain!);
    this.onConfigChange(this.config);
    this.updateControllers();
  }

  getGUI(): dat.GUI {
    return this.gui;
  }

  setVisible(visible: boolean): void {
    this.gui.domElement.style.display = visible ? 'block' : 'none';
  }

  dispose(): void {
    this.gui.destroy();
  }
}