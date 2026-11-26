import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { ViewMode } from '../core/math/Types';

export class DomainRenderer {
  private world: OptimizationWorld;
  private sceneManager: any;
  private domainBox: THREE.Group;
  private axisLines: THREE.Group;
  private axisLabels: THREE.Group;
  private visible = true;
  private mode: ViewMode = 'natural';

  private frameMaterial: THREE.LineBasicMaterial | null = null;
  private xAxisMaterial: THREE.LineBasicMaterial | null = null;
  private zAxisMaterial: THREE.LineBasicMaterial | null = null;
  private labelMaterials: THREE.SpriteMaterial[] = [];

  constructor(world: OptimizationWorld, sceneManager: any) {
    this.world = world;
    this.sceneManager = sceneManager;
    this.domainBox = new THREE.Group();
    this.axisLines = new THREE.Group();
    this.axisLabels = new THREE.Group();
    this.sceneManager.getOverlayGroup().add(this.domainBox);
    this.sceneManager.getOverlayGroup().add(this.axisLines);
    this.sceneManager.getOverlayGroup().add(this.axisLabels);
    this.build();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.applyMode();
  }

  private applyMode(): void {
    const natural = this.mode === 'natural';
    if (this.frameMaterial) this.frameMaterial.opacity = natural ? 0.0 : 0.5;
    this.axisLines.visible = this.visible && !natural;
    this.axisLabels.visible = this.visible && !natural;
    if (this.xAxisMaterial) this.xAxisMaterial.opacity = 0.5;
    if (this.zAxisMaterial) this.zAxisMaterial.opacity = 0.5;
    for (const m of this.labelMaterials) m.opacity = 0.85;
  }

  private build(): void {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;

    const corners = [
      this.world.optimizationToWorld(x1Min, x2Min),
      this.world.optimizationToWorld(x1Max, x2Min),
      this.world.optimizationToWorld(x1Max, x2Max),
      this.world.optimizationToWorld(x1Min, x2Max),
    ];

    const y = -3;

    const boxGeometry = new THREE.BufferGeometry();
    const boxPositions = new Float32Array(4 * 3);
    for (let i = 0; i < 4; i++) {
      boxPositions[i * 3] = corners[i].x;
      boxPositions[i * 3 + 1] = y;
      boxPositions[i * 3 + 2] = corners[i].z;
    }
    boxGeometry.setAttribute('position', new THREE.BufferAttribute(boxPositions, 3));

    this.frameMaterial = new THREE.LineBasicMaterial({
      color: 0xaec2d8,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    });
    this.domainBox.add(new THREE.LineLoop(boxGeometry, this.frameMaterial));

    this.createAxisLines(corners, y);
    this.createAxisLabels(corners, y);
    this.applyMode();
  }

  private createAxisLines(corners: Array<{ x: number; z: number }>, y: number): void {
    const axisGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(4 * 3);
    positions[0] = corners[0].x; positions[1] = y; positions[2] = corners[0].z;
    positions[3] = corners[1].x; positions[4] = y; positions[5] = corners[1].z;
    positions[6] = corners[0].x; positions[7] = y; positions[8] = corners[0].z;
    positions[9] = corners[3].x; positions[10] = y; positions[11] = corners[3].z;
    axisGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xd98a8a, opacity: 0.5, transparent: true, depthWrite: false });
    this.zAxisMaterial = new THREE.LineBasicMaterial({ color: 0x7fc9ab, opacity: 0.5, transparent: true, depthWrite: false });

    this.axisLines.add(new THREE.Line(axisGeometry, this.xAxisMaterial));
    this.axisLines.add(new THREE.Line(axisGeometry.clone(), this.zAxisMaterial));
  }

  private createAxisLabels(corners: Array<{ x: number; z: number }>, y: number): void {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;

    this.createLabel(`${x1Min.toFixed(2)}`, corners[0].x, y - 0.6, corners[0].z);
    this.createLabel(`${x1Max.toFixed(2)}`, corners[1].x, y - 0.6, corners[1].z);
    this.createLabel(`${x2Max.toFixed(2)}`, corners[2].x, y - 0.6, corners[2].z);
    this.createLabel(`${x2Min.toFixed(2)}`, corners[3].x, y - 0.6, corners[3].z);

    this.createLabel('x₁', (corners[0].x + corners[1].x) / 2, y - 1.1, (corners[0].z + corners[1].z) / 2, '#d98a8a');
    this.createLabel('x₂', (corners[0].x + corners[3].x) / 2, y - 1.1, (corners[0].z + corners[3].z) / 2, '#7fc9ab');
  }

  private createLabel(text: string, x: number, y: number, z: number, color: string = '#b9c6d4'): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 64);
    ctx.fillStyle = color;
    ctx.font = '600 26px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.85 });
    this.labelMaterials.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(4, 2, 1);
    this.axisLabels.add(sprite);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.domainBox.visible = visible;
    this.axisLines.visible = visible && this.mode !== 'natural';
    this.axisLabels.visible = visible && this.mode !== 'natural';
  }

  rebuild(): void {
    this.clear();
    this.build();
  }

  clear(): void {
    this.labelMaterials = [];
    [this.domainBox, this.axisLines, this.axisLabels].forEach(group => {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.LineSegments || child instanceof THREE.Line || child instanceof THREE.LineLoop) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        } else if (child instanceof THREE.Sprite) {
          child.material.dispose();
          (child.material as THREE.SpriteMaterial).map?.dispose();
        }
      }
    });
    this.frameMaterial = null;
    this.xAxisMaterial = null;
    this.zAxisMaterial = null;
  }

  dispose(): void {
    this.clear();
    this.sceneManager.getOverlayGroup().remove(this.domainBox);
    this.sceneManager.getOverlayGroup().remove(this.axisLines);
    this.sceneManager.getOverlayGroup().remove(this.axisLabels);
  }
}
