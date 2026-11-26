import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { SceneManager } from './SceneManager';
import type { CandidateState, OptimizerState, RenderFrame } from '../core/simulation/types';

const MAX_AGENTS = 256;
const MAX_TRAIL_POINTS = 5;
const MARKER_OFFSET = 0.55;

/**
 * Renders generic scientific agents. This class never mutates logical
 * candidate state: it only maps optimizer coordinates to the terrain surface
 * and interpolates between two logical states for display.
 */
export class GenericAgentRenderer {
  private world: OptimizationWorld;
  private sceneManager: SceneManager;
  private group: THREE.Group;
  private candidateMesh: THREE.InstancedMesh;
  private birdBodyMesh: THREE.InstancedMesh;
  private birdWingMesh: THREE.InstancedMesh;
  private birdTailMesh: THREE.InstancedMesh;
  private bestGroup: THREE.Group;
  private bestRing: THREE.Mesh;
  private bestSphere: THREE.Mesh;
  private trailLines: THREE.LineSegments;
  private trailGeometry: THREE.BufferGeometry;
  private trailPositions: Float32Array;

  private trails = new Map<string, Array<{ x: number; y: number }>>();
  private lastIteration = -1;
  private lastCandidateKey = '';
  private currentState: OptimizerState | null = null;
  private currentFrame: RenderFrame | null = null;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private pickCallback: ((candidate: CandidateState) => void) | null = null;
  private visible = true;
  private trailOverride: boolean | null = null;
  private trailColors: Float32Array;
  private bestPath = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xc5a56a, transparent: true, opacity: .42, depthWrite: false }));
  private bestHistory: THREE.Vector3[] = [];
  private bestPathEnabled = false;

  setTrailsEnabled(enabled: boolean): void { this.trailOverride = enabled; }
  setBestPathEnabled(enabled: boolean): void { this.bestPathEnabled = enabled; this.bestPath.visible = enabled; }

  constructor(world: OptimizationWorld, sceneManager: SceneManager) {
    this.world = world;
    this.sceneManager = sceneManager;

    this.group = new THREE.Group();
    this.group.name = 'genericAgents';

    const geometry = new THREE.SphereGeometry(0.38, 10, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x183a2f,
      emissiveIntensity: 0.12,
      roughness: 0.72,
      metalness: 0.0,
    });
    this.candidateMesh = new THREE.InstancedMesh(geometry, material, MAX_AGENTS);
    this.candidateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.candidateMesh.frustumCulled = false;
    this.candidateMesh.userData.isAgents = true;
    this.candidateMesh.count = 0;
    this.group.add(this.candidateMesh);

    const birdMaterial = new THREE.MeshStandardMaterial({ color: 0x343a3a, roughness: .78, metalness: 0 });
    const bodyGeometry = new THREE.SphereGeometry(1, 12, 8);
    this.birdBodyMesh = new THREE.InstancedMesh(bodyGeometry, birdMaterial, MAX_AGENTS);
    this.birdBodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.birdBodyMesh.count = 0;
    this.birdBodyMesh.userData.isAgents = true;
    this.group.add(this.birdBodyMesh);

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.quadraticCurveTo(.42, -.12, .88, .42);
    wingShape.quadraticCurveTo(.5, .28, .28, .78);
    wingShape.quadraticCurveTo(.12, .48, 0, 0);
    const wingGeometry = new THREE.ShapeGeometry(wingShape, 3);
    wingGeometry.rotateX(-Math.PI / 2);
    this.birdWingMesh = new THREE.InstancedMesh(wingGeometry, birdMaterial, MAX_AGENTS * 2);
    this.birdWingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.birdWingMesh.count = 0;
    this.birdWingMesh.userData.isAgents = true;
    this.group.add(this.birdWingMesh);

    const tailGeometry = new THREE.ConeGeometry(.13, .48, 5);
    tailGeometry.rotateX(Math.PI / 2);
    this.birdTailMesh = new THREE.InstancedMesh(tailGeometry, birdMaterial, MAX_AGENTS);
    this.birdTailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.birdTailMesh.count = 0;
    this.birdTailMesh.userData.isAgents = true;
    this.group.add(this.birdTailMesh);

    this.bestGroup = new THREE.Group();
    this.bestGroup.visible = false;

    const ringGeometry = new THREE.TorusGeometry(0.78, 0.07, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xc5a56a,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.bestRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.bestRing.rotation.x = -Math.PI / 2;
    this.bestGroup.add(this.bestRing);

    const sphereGeometry = new THREE.SphereGeometry(0.2, 12, 10);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xdce8e2 });
    this.bestSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    this.bestGroup.add(this.bestSphere);
    this.group.add(this.bestGroup);

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailPositions = new Float32Array(MAX_AGENTS * (MAX_TRAIL_POINTS - 1) * 2 * 3);
    this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeometry.setDrawRange(0, 0);
    this.trailColors = new Float32Array(this.trailPositions.length);
    this.trailGeometry.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3));
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x92c8b6,
      vertexColors: true,
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
    });
    this.trailLines = new THREE.LineSegments(this.trailGeometry, trailMaterial);
    this.trailLines.frustumCulled = false;
    this.trailLines.visible = false;
    this.group.add(this.trailLines);
    this.bestPath.visible = false;
    this.group.add(this.bestPath);

    this.sceneManager.getMarkerGroup().add(this.group);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.group.visible = visible;
  }

  setPickCallback(callback: ((candidate: CandidateState) => void) | null): void {
    this.pickCallback = callback;
  }

  update(frame: RenderFrame | null): void {
    if (!frame) {
      this.clear();
      return;
    }
    this.currentFrame = frame;
    this.currentState = frame.current;

    const candidates = frame.current.candidates;
    const isPso = frame.current.algorithmState?.id === 'particle-swarm';
    const previousById = new Map<string, CandidateState>();
    if (frame.previous) {
      for (const candidate of frame.previous.candidates) previousById.set(candidate.id, candidate);
    }

    const key = candidates.map(c => c.id).join('|');
    if (frame.current.iteration < this.lastIteration) {
      this.trails.clear();
    }
    if (key !== this.lastCandidateKey) {
      this.trails.clear();
      this.lastCandidateKey = key;
    }
    const newLogicalState = this.lastIteration !== frame.current.iteration;
    this.lastIteration = frame.current.iteration;
    if (newLogicalState && Number.isFinite(frame.current.best.fitness)) {
      const best = frame.current.best.position;
      const p = this.world.projectAgentToTerrain(best.x, best.y, MARKER_OFFSET * .6);
      const point = new THREE.Vector3(p.x, p.y, p.z);
      if (!this.bestHistory.length || this.bestHistory[this.bestHistory.length - 1].distanceToSquared(point) > 1e-8) {
        this.bestHistory.push(point);
        if (this.bestHistory.length > 64) this.bestHistory.shift();
        this.bestPath.geometry.dispose();
        this.bestPath.geometry = new THREE.BufferGeometry().setFromPoints(this.bestHistory);
      }
    }
    this.bestPath.visible = this.bestPathEnabled && this.bestHistory.length > 1;

    const count = Math.min(candidates.length, MAX_AGENTS);
    this.candidateMesh.count = isPso ? 0 : count;
    this.birdBodyMesh.count = isPso ? count : 0;
    this.birdWingMesh.count = isPso ? count * 2 : 0;
    this.birdTailMesh.count = isPso ? count : 0;
    const birdMaterial = this.birdBodyMesh.material as THREE.MeshStandardMaterial;
    const flapTime = performance.now() / 1000;

    for (let i = 0; i < count; i++) {
      const candidate = candidates[i];
      const previous = previousById.get(candidate.id);
      const interpolated = this.interpolate(previous, candidate, frame.alpha);
      const worldPosition = this.world.projectAgentToTerrain(
        interpolated.x, interpolated.y, MARKER_OFFSET,
      );

      const isBest = candidate.id === frame.current.best.candidateId;
      const scale = (candidate.active ? 1 : 0.55) * (isBest ? 1.16 : 1);

      this.dummy.position.set(worldPosition.x, worldPosition.y, worldPosition.z);
      this.dummy.scale.setScalar(scale);
      const velocity = candidate.metadata as { vx?: number; vy?: number } | undefined;
      const dx = velocity?.vx ?? candidate.position.x - (previous?.position.x ?? candidate.position.x);
      const dz = velocity?.vy ?? candidate.position.y - (previous?.position.y ?? candidate.position.y);
      const heading = Math.hypot(dx, dz) > 1e-5 ? Math.atan2(dx, dz) : 0;
      this.dummy.rotation.set(0, heading, 0);
      this.dummy.updateMatrix();
      if (isPso) {
        const body = this.dummy.clone();
        body.position.y += .2;
        body.scale.set(.22 * scale, .17 * scale, .48 * scale);
        body.updateMatrix();
        this.birdBodyMesh.setMatrixAt(i, body.matrix);

        const flap = Math.sin(flapTime * 11 + i * 1.71) * .17;
        for (const side of [-1, 1]) {
          const wing = this.dummy.clone();
          wing.position.y += .25 * scale;
          wing.position.x += side * .12 * scale;
          wing.rotation.z = side * flap;
          wing.scale.set(side * .55 * scale, 1, .5 * scale);
          wing.updateMatrix();
          this.birdWingMesh.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), wing.matrix);
        }

        const tail = this.dummy.clone();
        tail.position.y += .2 * scale;
        tail.position.z -= .42 * scale;
        tail.scale.setScalar(scale);
        tail.updateMatrix();
        this.birdTailMesh.setMatrixAt(i, tail.matrix);
      } else {
        this.candidateMesh.setMatrixAt(i, this.dummy.matrix);
      }

      this.color.setHex(isBest ? 0xc5a56a : candidate.active ? 0xdce8e2 : 0x7e9095);
      if (isPso) {
        this.color.setHex(isBest ? 0xc5a56a : candidate.active ? 0x3a4140 : 0x7e8585);
        const base = this.color.clone();
        const variance = ((i * 37) % 13) / 100 - .06;
        base.multiplyScalar(1 + variance);
        this.birdBodyMesh.setColorAt(i, base);
        this.birdWingMesh.setColorAt(i * 2, base);
        this.birdWingMesh.setColorAt(i * 2 + 1, base);
        this.birdTailMesh.setColorAt(i, base);
      } else this.candidateMesh.setColorAt(i, this.color);

      if (newLogicalState) this.pushTrail(candidate.id, candidate.position);
    }

    this.candidateMesh.instanceMatrix.needsUpdate = true;
    if (this.candidateMesh.instanceColor) this.candidateMesh.instanceColor.needsUpdate = true;
    for (const mesh of [this.birdBodyMesh, this.birdWingMesh, this.birdTailMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    this.updateBestMarker(frame, previousById);
    this.updateTrails();

    this.bestGroup.visible = this.visible && count > 0 && Number.isFinite(frame.current.best.fitness);
    this.group.visible = this.visible;
  }

  private interpolate(
    previous: CandidateState | undefined,
    current: CandidateState,
    alpha: number,
  ): { x: number; y: number } {
    if (!previous || alpha >= 1) {
      return { x: current.position.x, y: current.position.y };
    }
    const t = Math.min(1, Math.max(0, alpha));
    return {
      x: previous.position.x + (current.position.x - previous.position.x) * t,
      y: previous.position.y + (current.position.y - previous.position.y) * t,
    };
  }

  private updateBestMarker(frame: RenderFrame, previousById: Map<string, CandidateState>): void {
    const best = frame.current.best;
    let position = best.position;
    const previous = best.candidateId ? previousById.get(best.candidateId) : undefined;
    if (previous && frame.alpha < 1) {
      const t = Math.min(1, Math.max(0, frame.alpha));
      position = {
        x: previous.position.x + (best.position.x - previous.position.x) * t,
        y: previous.position.y + (best.position.y - previous.position.y) * t,
      };
    }

    const worldPosition = this.world.projectAgentToTerrain(position.x, position.y, MARKER_OFFSET + 0.42);
    this.bestGroup.position.set(worldPosition.x, worldPosition.y, worldPosition.z);
    this.bestRing.rotation.z += 0.01;
  }

  private pushTrail(id: string, position: { x: number; y: number }): void {
    let trail = this.trails.get(id);
    if (!trail) {
      trail = [];
      this.trails.set(id, trail);
    }
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - position.x, last.y - position.y) > 1e-9) {
      trail.push({ x: position.x, y: position.y });
      if (trail.length > MAX_TRAIL_POINTS) trail.shift();
    }
  }

  private updateTrails(): void {
    let offset = 0;
    let hasTrails = false;

    for (const trail of this.trails.values()) {
      if (trail.length < 2) continue;
      hasTrails = true;
      for (let i = 0; i < trail.length - 1; i++) {
        const a = this.world.projectAgentToTerrain(trail[i].x, trail[i].y, MARKER_OFFSET * 0.55);
        const b = this.world.projectAgentToTerrain(trail[i + 1].x, trail[i + 1].y, MARKER_OFFSET * 0.55);
        const fade = .07 + .93 * i / Math.max(1, trail.length - 2);
        this.trailColors.fill(fade, offset, offset + 6);
        this.trailPositions[offset++] = a.x;
        this.trailPositions[offset++] = a.y;
        this.trailPositions[offset++] = a.z;
        this.trailPositions[offset++] = b.x;
        this.trailPositions[offset++] = b.y;
        this.trailPositions[offset++] = b.z;
      }
    }

    this.trailGeometry.setDrawRange(0, offset / 3);
    const attribute = this.trailGeometry.getAttribute('position') as THREE.BufferAttribute;
    attribute.needsUpdate = true;
    this.trailGeometry.getAttribute('color').needsUpdate = true;
    const mode = this.world.getConfig().viewMode;
    const enabled = this.trailOverride ?? (mode !== 'natural' && window.innerWidth >= 700);
    this.trailLines.visible = this.visible && hasTrails && enabled;
  }

  /**
   * Attempt to pick an agent at the pointer. Returns true when a candidate was
   * hit so the caller can suppress the terrain probe for that click.
   */
  tryPick(event: MouseEvent): boolean {
    if (!this.visible || !this.currentState || this.candidateMesh.count === 0) return false;

    const canvas = this.sceneManager.getRenderer().domElement;
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.getCamera());

    const isPso = this.currentFrame?.current.algorithmState?.id === 'particle-swarm';
    const hits = this.raycaster.intersectObjects(
      isPso ? [this.birdBodyMesh, this.birdWingMesh, this.birdTailMesh] : [this.candidateMesh], false,
    );
    if (hits.length > 0) {
      const instanceId = hits[0].instanceId;
      if (instanceId !== undefined && instanceId < this.currentState.candidates.length) {
        this.pickCallback?.(this.currentState.candidates[instanceId]);
        return true;
      }
    }

    const bestHits = this.raycaster.intersectObject(this.bestGroup, true);
    if (bestHits.length > 0) {
      const best = this.currentState.candidates.find(c => c.id === this.currentState?.best.candidateId);
      if (best) {
        this.pickCallback?.(best);
        return true;
      }
    }
    return false;
  }

  clear(): void {
    this.currentState = null;
    this.currentFrame = null;
    this.candidateMesh.count = 0;
    this.birdBodyMesh.count = 0;
    this.birdWingMesh.count = 0;
    this.birdTailMesh.count = 0;
    this.bestGroup.visible = false;
    this.trailLines.visible = false;
    this.trailGeometry.setDrawRange(0, 0);
    this.trails.clear();
    this.lastIteration = -1;
    this.bestHistory = []; this.bestPath.visible = false;
    this.bestPath.geometry.dispose(); this.bestPath.geometry = new THREE.BufferGeometry();
    this.lastCandidateKey = '';
  }

  dispose(): void {
    this.clear();
    this.sceneManager.getMarkerGroup().remove(this.group);
    this.candidateMesh.geometry.dispose();
    (this.candidateMesh.material as THREE.Material).dispose();
    this.birdBodyMesh.geometry.dispose();
    (this.birdBodyMesh.material as THREE.Material).dispose();
    this.birdWingMesh.geometry.dispose();
    this.birdTailMesh.geometry.dispose();
    this.bestRing.geometry.dispose();
    (this.bestRing.material as THREE.Material).dispose();
    this.bestSphere.geometry.dispose();
    (this.bestSphere.material as THREE.Material).dispose();
    this.bestPath.geometry.dispose();
    (this.bestPath.material as THREE.Material).dispose();
    this.trailGeometry.dispose();
    (this.trailLines.material as THREE.Material).dispose();
  }
}
