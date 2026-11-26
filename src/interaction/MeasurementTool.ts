import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { ProbeData, DistanceMeasurement } from '../core/math/Types';
import { SceneManager } from '../rendering/SceneManager';

export class MeasurementTool {
  private world: OptimizationWorld;
  private sceneManager: SceneManager;
  private points: ProbeData[] = [];
  private measurementLines: THREE.Group;
  private measurementLabels: THREE.Group;
  private maxPoints = 2;
  private callback: ((measurement: DistanceMeasurement | null) => void) | null = null;

  constructor(world: OptimizationWorld, sceneManager: SceneManager) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.measurementLines = new THREE.Group();
    this.measurementLabels = new THREE.Group();
    this.sceneManager.getMarkerGroup().add(this.measurementLines);
    this.sceneManager.getMarkerGroup().add(this.measurementLabels);
  }

  setCallback(callback: (measurement: DistanceMeasurement | null) => void): void {
    this.callback = callback;
  }

  addPoint(data: ProbeData): void {
    if (this.points.length >= this.maxPoints) {
      this.points.shift();
      this.clearVisuals();
    }
    this.points.push(data);
    this.updateVisuals();
    
    if (this.points.length === 2) {
      const measurement = this.computeMeasurement(this.points[0], this.points[1]);
      this.callback?.(measurement);
    } else {
      this.callback?.(null);
    }
  }

  private computeMeasurement(a: ProbeData, b: ProbeData): DistanceMeasurement {
    const optDist = Math.hypot(a.x1 - b.x1, a.x2 - b.x2);
    const costDiff = b.cost - a.cost;
    
    const worldA = this.world.optimizationToWorld(a.x1, a.x2);
    const worldB = this.world.optimizationToWorld(b.x1, b.x2);
    const ya = this.world.getTerrainHeight(a.x1, a.x2);
    const yb = this.world.getTerrainHeight(b.x1, b.x2);
    const worldDist = Math.hypot(worldA.x - worldB.x, ya - yb, worldA.z - worldB.z);

    return {
      pointA: a,
      pointB: b,
      optimizationDistance: optDist,
      costDifference: costDiff,
      worldDistance: worldDist,
    };
  }

  private updateVisuals(): void {
    this.clearVisuals();

    if (this.points.length === 0) return;

    const pointGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const pointMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.9,
    });

    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const y = this.world.getTerrainHeight(p.x1, p.x2);
      
      const sphere = new THREE.Mesh(pointGeometry, pointMaterial.clone());
      sphere.position.set(p.worldX, y + 0.5, p.worldZ);
      this.measurementLines.add(sphere);

      const lineGeometry = new THREE.BufferGeometry();
      const linePositions = new Float32Array(6);
      linePositions[0] = p.worldX; linePositions[1] = -5; linePositions[2] = p.worldZ;
      linePositions[3] = p.worldX; linePositions[4] = y + 0.5; linePositions[5] = p.worldZ;
      lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.4 });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      this.measurementLines.add(line);

      this.createLabel(p, i);
    }

    if (this.points.length === 2) {
      this.createMeasurementLine(this.points[0], this.points[1]);
    }
  }

  private createMeasurementLine(a: ProbeData, b: ProbeData): void {
    const ya = this.world.getTerrainHeight(a.x1, a.x2);
    const yb = this.world.getTerrainHeight(b.x1, b.x2);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6);
    positions[0] = a.worldX; positions[1] = ya + 0.5; positions[2] = a.worldZ;
    positions[3] = b.worldX; positions[4] = yb + 0.5; positions[5] = b.worldZ;
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineDashedMaterial({
      color: 0xffff00,
      dashSize: 0.5,
      gapSize: 0.3,
      transparent: true,
      opacity: 0.8,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    this.measurementLines.add(line);

    const midX = (a.worldX + b.worldX) / 2;
    const midY = Math.max(ya, yb) + 2;
    const midZ = (a.worldZ + b.worldZ) / 2;

    const measurement = this.computeMeasurement(a, b);
    this.createMeasurementLabel(midX, midY, midZ, measurement);
  }

  private createLabel(point: ProbeData, index: number): void {
    const y = this.world.getTerrainHeight(point.x1, point.x2);
    
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, 200, 80);
    ctx.fillStyle = '#ffff00';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Point ${index + 1}`, 100, 18);
    ctx.fillText(`x₁: ${point.x1.toFixed(3)}`, 100, 36);
    ctx.fillText(`x₂: ${point.x2.toFixed(3)}`, 100, 54);
    ctx.fillText(`f: ${point.cost.toFixed(3)}`, 100, 72);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(point.worldX, y + 3, point.worldZ);
    sprite.scale.set(6, 2.4, 1);
    this.measurementLabels.add(sprite);
  }

  private createMeasurementLabel(x: number, y: number, z: number, m: DistanceMeasurement): void {
    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, 280, 100);
    ctx.fillStyle = '#ffff00';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Distance Measurement', 140, 18);
    ctx.fillText(`Δx (opt): ${m.optimizationDistance.toFixed(4)}`, 140, 38);
    ctx.fillText(`Δf: ${m.costDifference.toFixed(4)}`, 140, 58);
    ctx.fillText(`Δx (world): ${m.worldDistance.toFixed(4)}`, 140, 78);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(8, 2.8, 1);
    this.measurementLabels.add(sprite);
  }

  private clearVisuals(): void;
  private clearVisuals(): void {
    [this.measurementLines, this.measurementLabels].forEach(group => {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        } else if (child instanceof THREE.Sprite) {
          child.material.dispose();
          (child.material as THREE.SpriteMaterial).map?.dispose();
        }
      }
    });
  }

  clear(): void {
    this.points = [];
    this.clearVisuals();
    this.callback?.(null);
  }

  getPoints(): ProbeData[] {
    return [...this.points];
  }

  dispose(): void {
    this.clear();
    this.sceneManager.getMarkerGroup().remove(this.measurementLines);
    this.sceneManager.getMarkerGroup().remove(this.measurementLabels);
  }
}