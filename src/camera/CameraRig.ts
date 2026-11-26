import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { CameraPreset } from '../core/math/Types';

export interface FunctionView {
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
  verticalScale: number;
}

// Benchmark-specific framing. The world is a centered 100x100 domain; the
// optimisation domain is remapped into it, so positions are in world units.
const FUNCTION_VIEWS: Record<string, FunctionView> = {
  sphere: { pos: [76, 54, 76], target: [0, 3, 0], fov: 50, verticalScale: 1.6 },
  ellipsoid: { pos: [76, 54, 76], target: [0, 3, 0], fov: 50, verticalScale: 1.6 },
  booth: { pos: [66, 50, 80], target: [5, 2, 12], fov: 50, verticalScale: 1.6 },
  rastrigin: { pos: [96, 84, 96], target: [0, 4, 0], fov: 50, verticalScale: 1.15 },
  ackley: { pos: [96, 70, 96], target: [0, 3, 0], fov: 50, verticalScale: 1.7 },
  rosenbrock: { pos: [26, 40, 98], target: [8, 6, 4], fov: 52, verticalScale: 2.4 },
  himmelblau: { pos: [96, 90, 96], target: [0, 3, 0], fov: 52, verticalScale: 1.6 },
  griewank: { pos: [92, 78, 92], target: [0, 3, 0], fov: 50, verticalScale: 1.5 },
  schwefel: { pos: [96, 84, 96], target: [0, 3, 0], fov: 50, verticalScale: 1.1 },
  beale: { pos: [64, 50, 80], target: [6, 3, 6], fov: 52, verticalScale: 1.8 },
  matyas: { pos: [76, 54, 76], target: [0, 3, 0], fov: 50, verticalScale: 1.6 },
  easom: { pos: [66, 50, 78], target: [0, 3, 0], fov: 50, verticalScale: 1.4 },
  'three-hump-camel': { pos: [70, 50, 70], target: [0, 3, 0], fov: 48, verticalScale: 1.6 },
  'six-hump-camel': { pos: [70, 50, 70], target: [0, 3, 0], fov: 48, verticalScale: 1.6 },
};

const DEFAULT_VIEW: FunctionView = { pos: [84, 66, 84], target: [0, 4, 0], fov: 50, verticalScale: 1.6 };

export class CameraRig {
  static getFunctionView(id: string): FunctionView {
    return FUNCTION_VIEWS[id] ?? DEFAULT_VIEW;
  }

  private camera: THREE.PerspectiveCamera;
  private world: OptimizationWorld;
  private target: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private currentPreset: CameraPreset = 'orbit';
  private isTransitioning = false;
  private transitionStartTime = 0;
  private transitionDuration = 0.7;
  private transitionStartPos: THREE.Vector3 = new THREE.Vector3();
  private transitionStartTarget: THREE.Vector3 = new THREE.Vector3();
  private transitionEndPos: THREE.Vector3 = new THREE.Vector3();
  private transitionEndTarget: THREE.Vector3 = new THREE.Vector3();

  private orbitRadius = 115;
  private orbitTheta = Math.PI / 4;
  private orbitPhi = Math.PI / 4;
  private minRadius = 12;
  private maxRadius = 320;

  constructor(camera: THREE.PerspectiveCamera, world: OptimizationWorld) {
    this.camera = camera;
    this.world = world;
    if (typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.transitionDuration = 0.05;
    }
    this.applyPreset('orbit');
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getCurrentPreset(): CameraPreset {
    return this.currentPreset;
  }

  // ---------------------------------------------------------------- presets
  setPreset(preset: CameraPreset, animate: boolean = true): void {
    if (this.currentPreset === preset && !animate) return;
    this.currentPreset = preset;
    if (animate) this.startTransition(preset);
    else this.applyPreset(preset);
  }

  /** Apply a benchmark-specific view. Frees the orbit pivot at the target. */
  setFunctionPreset(id: string, animate: boolean = true): void {
    const view = CameraRig.getFunctionView(id);
    const pos = new THREE.Vector3(view.pos[0], view.pos[1], view.pos[2]);
    const target = new THREE.Vector3(view.target[0], view.target[1], view.target[2]);

    this.camera.fov = view.fov;
    this.camera.updateProjectionMatrix();

    this.currentPreset = 'orbit';
    this.deriveOrbitFrom(pos, target);

    if (animate) {
      this.beginTransition(pos, target);
    } else {
      this.target.copy(target);
      this.camera.position.copy(pos);
      this.camera.lookAt(target);
      this.isTransitioning = false;
    }
  }

  private deriveOrbitFrom(pos: THREE.Vector3, target: THREE.Vector3): void {
    const rel = new THREE.Vector3().subVectors(pos, target);
    this.orbitRadius = THREE.MathUtils.clamp(rel.length(), this.minRadius, this.maxRadius);
    this.orbitPhi = Math.acos(THREE.MathUtils.clamp(rel.y / (rel.length() || 1), -1, 1));
    this.orbitTheta = Math.atan2(rel.z, rel.x);
  }

  private beginTransition(endPos: THREE.Vector3, endTarget: THREE.Vector3): void {
    this.transitionStartPos.copy(this.camera.position);
    this.transitionStartTarget.copy(this.target);
    this.transitionEndPos.copy(endPos);
    this.transitionEndTarget.copy(endTarget);
    this.transitionStartTime = performance.now() / 1000;
    this.isTransitioning = true;
  }

  private startTransition(preset: CameraPreset): void {
    this.computePresetPosition(preset, this.transitionEndPos, this.transitionEndTarget);
    this.beginTransition(this.transitionEndPos, this.transitionEndTarget);
  }

  private computePresetPosition(
    preset: CameraPreset,
    outPos: THREE.Vector3,
    outTarget: THREE.Vector3,
  ): void {
    const config = this.world.getConfig();
    const minima = this.world.getGlobalMinima();
    const primaryMin = minima[0];

    switch (preset) {
      case 'overview': {
        outPos.set(84, 66, 84);
        outTarget.set(0, 4, 0);
        break;
      }
      case 'orbit': {
        const x = this.target.x + this.orbitRadius * Math.sin(this.orbitPhi) * Math.cos(this.orbitTheta);
        const y = this.target.y + this.orbitRadius * Math.cos(this.orbitPhi);
        const z = this.target.z + this.orbitRadius * Math.sin(this.orbitPhi) * Math.sin(this.orbitTheta);
        outPos.set(x, y, z);
        outTarget.copy(this.target);
        break;
      }
      case 'top-down': {
        outPos.set(0, 150, 0.001);
        outTarget.set(0, 0, 0);
        break;
      }
      case 'valley-view': {
        outPos.set(-8, 58, 96);
        outTarget.set(0, 7, 0);
        break;
      }
      case 'minimum-focus': {
        if (primaryMin) {
          const { x, z } = this.world.optimizationToWorld(primaryMin.x1, primaryMin.x2);
          const y = this.world.getTerrainHeight(primaryMin.x1, primaryMin.x2);
          outPos.set(x + 16, y + 18, z + 16);
          outTarget.set(x, y, z);
        } else {
          outPos.set(0, 30, 20);
          outTarget.set(0, 0, 0);
        }
        break;
      }
      case 'saddle-focus': {
        const saddles = this.world.getCriticalPoints().filter(cp => cp.type === 'saddle');
        if (saddles.length > 0) {
          const saddle = saddles[0];
          const { x, z } = this.world.optimizationToWorld(saddle.x1, saddle.x2);
          const y = this.world.getTerrainHeight(saddle.x1, saddle.x2);
          outPos.set(x + 15, y + 20, z + 15);
          outTarget.set(x, y, z);
        } else {
          outPos.set(15, 20, 15);
          outTarget.set(0, 0, 0);
        }
        break;
      }
      case 'cross-section': {
        const csConfig = config.overlays.crossSection;
        if (csConfig.enabled) {
          if (csConfig.mode === 'x') {
            const x1 = config.domain.x1Min + (csConfig.position + 1) / 2 * (config.domain.x1Max - config.domain.x1Min);
            const { x, z } = this.world.optimizationToWorld(x1, config.domain.x2Min);
            outPos.set(x, 50, z - 30);
            outTarget.set(x, 0, z);
          } else if (csConfig.mode === 'z') {
            const x2 = config.domain.x2Min + (csConfig.position + 1) / 2 * (config.domain.x2Max - config.domain.x2Min);
            const { x, z } = this.world.optimizationToWorld(config.domain.x1Min, x2);
            outPos.set(x - 30, 50, z);
            outTarget.set(x, 0, z);
          }
        } else {
          outPos.set(0, 50, -30);
          outTarget.set(0, 0, 0);
        }
        break;
      }
      case 'cinematic': {
        outPos.set(100, 80, 100);
        outTarget.set(0, 0, 0);
        break;
      }
      default: {
        outPos.set(84, 66, 84);
        outTarget.set(0, 4, 0);
      }
    }
  }

  private applyPreset(preset: CameraPreset): void {
    this.computePresetPosition(preset, this.camera.position, this.target);
    this.camera.lookAt(this.target);
    this.isTransitioning = false;
  }

  private applyOrbit(): void {
    const x = this.target.x + this.orbitRadius * Math.sin(this.orbitPhi) * Math.cos(this.orbitTheta);
    const y = this.target.y + this.orbitRadius * Math.cos(this.orbitPhi);
    const z = this.target.z + this.orbitRadius * Math.sin(this.orbitPhi) * Math.sin(this.orbitTheta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  update(_deltaTime: number): void {
    if (this.isTransitioning) {
      const elapsed = performance.now() / 1000 - this.transitionStartTime;
      const t = Math.min(elapsed / this.transitionDuration, 1);
      const easedT = this.easeInOutCubic(t);

      this.camera.position.lerpVectors(this.transitionStartPos, this.transitionEndPos, easedT);
      this.target.lerpVectors(this.transitionStartTarget, this.transitionEndTarget, easedT);
      this.camera.lookAt(this.target);

      if (t >= 1) {
        this.isTransitioning = false;
        this.camera.position.copy(this.transitionEndPos);
        this.target.copy(this.transitionEndTarget);
      }
    }

    if (this.currentPreset === 'cinematic' && !this.isTransitioning) {
      const time = performance.now() / 1000 * 0.1;
      this.orbitTheta = time;
      this.applyOrbit();
    }
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  setOrbitRadius(radius: number): void {
    this.orbitRadius = THREE.MathUtils.clamp(radius, this.minRadius, this.maxRadius);
    if (this.currentPreset === 'orbit' && !this.isTransitioning) this.applyOrbit();
  }

  setOrbitAngles(theta: number, phi: number): void {
    this.orbitTheta = theta;
    this.orbitPhi = THREE.MathUtils.clamp(phi, 0.1, Math.PI - 0.1);
    if (this.currentPreset === 'orbit' && !this.isTransitioning) this.applyOrbit();
  }

  orbit(deltaTheta: number, deltaPhi: number): void {
    if (this.currentPreset !== 'orbit') this.currentPreset = 'orbit';
    this.orbitTheta += deltaTheta;
    this.orbitPhi = THREE.MathUtils.clamp(this.orbitPhi + deltaPhi, 0.1, Math.PI - 0.1);
    if (!this.isTransitioning) this.applyOrbit();
  }

  zoom(delta: number): void {
    this.orbitRadius = THREE.MathUtils.clamp(this.orbitRadius * (1 + delta), this.minRadius, this.maxRadius);
    if (this.currentPreset === 'orbit' && !this.isTransitioning) this.applyOrbit();
  }

  pan(deltaX: number, deltaY: number): void {
    const right = new THREE.Vector3().crossVectors(this.camera.getWorldDirection(new THREE.Vector3()), this.camera.up).normalize();
    const up = this.camera.up.clone().normalize();
    this.target.addScaledVector(right, -deltaX);
    this.target.addScaledVector(up, deltaY);
    this.camera.position.addScaledVector(right, -deltaX);
    this.camera.position.addScaledVector(up, deltaY);
  }

  focusOnPoint(x1: number, x2: number): void {
    const { x, z } = this.world.optimizationToWorld(x1, x2);
    const y = this.world.getTerrainHeight(x1, x2);
    this.target.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  getTarget(): THREE.Vector3 {
    return this.target.clone();
  }

  setTarget(target: THREE.Vector3): void {
    this.target.copy(target);
    this.camera.lookAt(this.target);
  }

  isTransitioningActive(): boolean {
    return this.isTransitioning;
  }
}
