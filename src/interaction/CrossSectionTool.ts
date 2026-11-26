import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { CrossSectionProfile } from '../core/math/Types';
import { SceneManager } from '../rendering/SceneManager';

export type CrossSectionMode = 'x' | 'z' | 'custom';

export class CrossSectionTool {
  private world: OptimizationWorld;
  private sceneManager: SceneManager;
  private mode: CrossSectionMode = 'x';
  private position = 0;
  private customLine: Array<{ x1: number; x2: number }> = [];
  private slicePlane: THREE.Mesh | null = null;
  private profileLine: THREE.Line | null = null;
  private profileGeometry: THREE.BufferGeometry | null = null;
  private profileMaterial: THREE.LineBasicMaterial;
  private profileGroup: THREE.Group;
  private enabled = false;
  private visible = true;
  private profileCallback: ((profile: CrossSectionProfile | null) => void) | null = null;

  constructor(world: OptimizationWorld, sceneManager: SceneManager) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.profileMaterial = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 2 });
    this.profileGroup = new THREE.Group();
    this.sceneManager.getMarkerGroup().add(this.profileGroup);
  }

  setMode(mode: CrossSectionMode): void {
    this.mode = mode;
    if (this.enabled) this.update();
  }

  setPosition(position: number): void {
    this.position = Math.max(-1, Math.min(1, position));
    if (this.enabled) this.update();
  }

  setCustomLine(points: Array<{ x1: number; x2: number }>): void {
    this.customLine = points;
    if (this.enabled && this.mode === 'custom') this.update();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.profileGroup.visible = enabled && this.visible;
    if (enabled) this.update();
    else this.clearSlicePlane();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.profileGroup.visible = this.enabled && visible;
  }

  setProfileCallback(callback: (profile: CrossSectionProfile | null) => void): void {
    this.profileCallback = callback;
  }

  update(): void {
    if (!this.enabled) return;
    this.clearSlicePlane();
    this.createSlicePlane();
    this.generateProfile();
  }

  private createSlicePlane(): void {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;

    let x1: number, x2: number;
    const normal = new THREE.Vector3();

    if (this.mode === 'x') {
      x1 = x1Min + (this.position + 1) / 2 * (x1Max - x1Min);
      x2 = x2Min;
      normal.set(1, 0, 0);
    } else if (this.mode === 'z') {
      x1 = x1Min;
      x2 = x2Min + (this.position + 1) / 2 * (x2Max - x2Min);
      normal.set(0, 0, 1);
    } else {
      return;
    }

    const { x, z } = this.world.optimizationToWorld(x1, x2);
    const y = this.world.getTerrainHeight(x1, x2);

    const planeGeometry = new THREE.PlaneGeometry(120, 120);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.slicePlane = new THREE.Mesh(planeGeometry, planeMaterial);
    this.slicePlane.position.set(x, y + 50, z);
    this.slicePlane.rotation.x = -Math.PI / 2;
    if (this.mode === 'x') this.slicePlane.rotation.z = Math.PI / 2;
    this.sceneManager.getMarkerGroup().add(this.slicePlane);
  }

  private clearSlicePlane(): void {
    if (this.slicePlane) {
      this.sceneManager.getMarkerGroup().remove(this.slicePlane);
      this.slicePlane.geometry.dispose();
      (this.slicePlane.material as THREE.Material).dispose();
      this.slicePlane = null;
    }
  }

  private generateProfile(): void {
    let profile: CrossSectionProfile | null = null;

    if (this.mode === 'x') {
      profile = this.sampleXSlice();
    } else if (this.mode === 'z') {
      profile = this.sampleZSlice();
    } else if (this.mode === 'custom' && this.customLine.length >= 2) {
      profile = this.sampleCustomLine();
    }

    this.createProfileVisualization(profile);
    this.profileCallback?.(profile);
  }

  private sampleXSlice(): CrossSectionProfile {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;
    const x1 = x1Min + (this.position + 1) / 2 * (x1Max - x1Min);
    const samples = 200;

    const parameter = new Float32Array(samples);
    const cost = new Float32Array(samples);
    const gradientMagnitude = new Float32Array(samples);
    const slope = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const x2 = x2Min + t * (x2Max - x2Min);
      parameter[i] = t;
      cost[i] = this.world.evaluate(x1, x2);
      const grad = this.world.gradient(x1, x2);
      gradientMagnitude[i] = Math.hypot(grad.x, grad.y);
      slope[i] = this.world.getSlope(x1, x2);
    }

    return { parameter, cost, gradientMagnitude, slope };
  }

  private sampleZSlice(): CrossSectionProfile {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;
    const x2 = x2Min + (this.position + 1) / 2 * (x2Max - x2Min);
    const samples = 200;

    const parameter = new Float32Array(samples);
    const cost = new Float32Array(samples);
    const gradientMagnitude = new Float32Array(samples);
    const slope = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const x1 = x1Min + t * (x1Max - x1Min);
      parameter[i] = t;
      cost[i] = this.world.evaluate(x1, x2);
      const grad = this.world.gradient(x1, x2);
      gradientMagnitude[i] = Math.hypot(grad.x, grad.y);
      slope[i] = this.world.getSlope(x1, x2);
    }

    return { parameter, cost, gradientMagnitude, slope };
  }

  private sampleCustomLine(): CrossSectionProfile {
    if (this.customLine.length < 2) return this.createEmptyProfile();

    const samples = 200;
    const parameter = new Float32Array(samples);
    const cost = new Float32Array(samples);
    const gradientMagnitude = new Float32Array(samples);
    const slope = new Float32Array(samples);

    const totalSegments = this.customLine.length - 1;
    const segmentLength = 1 / totalSegments;

    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const segmentIdx = Math.min(Math.floor(t / segmentLength), totalSegments - 1);
      const localT = (t - segmentIdx * segmentLength) / segmentLength;
      
      const a = this.customLine[segmentIdx];
      const b = this.customLine[segmentIdx + 1];
      
      const x1 = a.x1 + localT * (b.x1 - a.x1);
      const x2 = a.x2 + localT * (b.x2 - a.x2);
      
      parameter[i] = t;
      cost[i] = this.world.evaluate(x1, x2);
      const grad = this.world.gradient(x1, x2);
      gradientMagnitude[i] = Math.hypot(grad.x, grad.y);
      slope[i] = this.world.getSlope(x1, x2);
    }

    return { parameter, cost, gradientMagnitude, slope };
  }

  private createEmptyProfile(): CrossSectionProfile {
    return {
      parameter: new Float32Array(1),
      cost: new Float32Array(1),
      gradientMagnitude: new Float32Array(1),
      slope: new Float32Array(1),
    };
  }

  private createProfileVisualization(profile: CrossSectionProfile | null): void {
    if (this.profileLine) {
      this.profileGroup.remove(this.profileLine);
      this.profileLine.geometry.dispose();
      this.profileLine = null;
    }

    if (!profile || profile.parameter.length < 2) return;

    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;

    let startOpt: { x1: number; x2: number };
    let endOpt: { x1: number; x2: number };

    if (this.mode === 'x') {
      const x1 = x1Min + (this.position + 1) / 2 * (x1Max - x1Min);
      startOpt = { x1, x2: x2Min };
      endOpt = { x1, x2: x2Max };
    } else if (this.mode === 'z') {
      const x2 = x2Min + (this.position + 1) / 2 * (x2Max - x2Min);
      startOpt = { x1: x1Min, x2 };
      endOpt = { x1: x1Max, x2 };
    } else if (this.customLine.length >= 2) {
      startOpt = this.customLine[0];
      endOpt = this.customLine[this.customLine.length - 1];
    } else {
      return;
    }

    const startWorld = this.world.optimizationToWorld(startOpt.x1, startOpt.x2);
    const endWorld = this.world.optimizationToWorld(endOpt.x1, endOpt.x2);

    const positions = new Float32Array(profile.parameter.length * 3);
    for (let i = 0; i < profile.parameter.length; i++) {
      const t = profile.parameter[i];
      const x = startWorld.x + t * (endWorld.x - startWorld.x);
      const z = startWorld.z + t * (endWorld.z - startWorld.z);
      const y = profile.cost[i] * config.verticalScale * 10 / this.getMaxCost() + 2;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    this.profileGeometry = new THREE.BufferGeometry();
    this.profileGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.profileLine = new THREE.Line(this.profileGeometry, this.profileMaterial.clone());
    this.profileGroup.add(this.profileLine);
  }

  private getMaxCost(): number {
    const buffers = this.world.getLandscapeBuffers();
    if (!buffers) return 1;
    return Math.max(...buffers.costBuffer);
  }

  getMode(): CrossSectionMode {
    return this.mode;
  }

  getPosition(): number {
    return this.position;
  }

  getCustomLine(): Array<{ x1: number; x2: number }> {
    return [...this.customLine];
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {
    this.clearSlicePlane();
    if (this.profileLine) {
      this.profileGroup.remove(this.profileLine);
      this.profileLine.geometry.dispose();
      this.profileLine = null;
    }
    this.profileMaterial.dispose();
    this.sceneManager.getMarkerGroup().remove(this.profileGroup);
  }
}