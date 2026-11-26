import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SphereSanctuary } from './SphereSanctuary';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { CriticalPoint } from '../core/math/Types';
import type { SceneManager } from './SceneManager';

/** Render-only landmarks, centered on each reported global optimum. */
export class OasisRenderer {
  private sanctuary: SphereSanctuary;
  private waterPhase = 0;
  private atmosphereMix = 0;
  private atmosphereTarget = 0;
  private oases = new THREE.Group();
  private waterMaterials: THREE.ShaderMaterial[] = [];

  constructor(private world: OptimizationWorld, private sceneManager: SceneManager) {
    this.sanctuary = new SphereSanctuary(world);
    this.oases.name = 'optimum-oases';
    this.oases.userData.isEnvironment = true;
    this.sceneManager.getWaterGroup().add(this.oases);
  }

  rebuild(): void {
    this.clear();
    if (this.world.getConfig().functionId === 'sphere') {
      this.sanctuary.rebuild(); this.oases.add(this.sanctuary.group); return;
    }
    const minima = this.world.getGlobalMinima();
    minima.forEach((min, index) => this.createOasis(min, index, minima));
  }

  private rng(seed: number): () => number {
    let state = seed >>> 0;
    return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }

  private inside(x: number, z: number): boolean {
    const p = this.world.worldToOptimization(x, z), d = this.world.getConfig().domain;
    return p.x1 >= d.x1Min && p.x1 <= d.x1Max && p.x2 >= d.x2Min && p.x2 <= d.x2Max;
  }

  private surface(x: number, z: number, offset = 0): THREE.Vector3 {
    const p = this.world.worldToOptimization(x, z);
    return new THREE.Vector3(x, this.world.getTerrainSurfaceHeight(p.x1, p.x2) + offset, z);
  }

  private radiusFor(min: CriticalPoint, minima: CriticalPoint[]): number {
    const center = this.world.optimizationToWorld(min.x1, min.x2);
    let radius = minima.length > 1 ? 3.0 : 3.8;
    // Reserve space for the entire vegetation footprint, not only the water.
    for (const other of minima) {
      if (other === min) continue;
      const p = this.world.optimizationToWorld(other.x1, other.x2);
      const distance = Math.hypot(p.x - center.x, p.z - center.z);
      if (distance > 1e-5) radius = Math.min(radius, distance * .18);
    }
    // Shrink in a narrow or steep basin without flattening its sampled surface.
    for (let pass = 0; pass < 5; pass++) {
      let lowest = Infinity, highest = -Infinity;
      for (let i = 0; i < 12; i++) {
        const angle = i * Math.PI / 6, x = center.x + Math.cos(angle) * radius, z = center.z + Math.sin(angle) * radius;
        if (!this.inside(x, z)) continue;
        const y = this.surface(x, z).y; lowest = Math.min(lowest, y); highest = Math.max(highest, y);
      }
      const centerY = this.surface(center.x, center.z).y;
      if (Math.max(highest - lowest, highest - centerY) <= .85) break;
      radius *= .65;
    }
    return radius;
  }

  private createOasis(min: CriticalPoint, index: number, minima: CriticalPoint[]): void {
    const center = this.world.optimizationToWorld(min.x1, min.x2), radius = this.radiusFor(min, minima);
    const rand = this.rng(0x9e3779b1 ^ Math.imul(index + 1, 2654435761));
    const group = new THREE.Group(); group.name = `oasis-${index}`;
    group.userData = { isEnvironment: true, optimum: { x1: min.x1, x2: min.x2 }, radius };
    this.oases.add(group);
    const stone: THREE.BufferGeometry[] = [], moss: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [];
    const addRock = (target: THREE.BufferGeometry[], point: THREE.Vector3, scale: THREE.Vector3) => {
      const geometry = new THREE.IcosahedronGeometry(1, 1); geometry.scale(scale.x, scale.y, scale.z);
      geometry.rotateY(rand() * Math.PI); geometry.translate(point.x, point.y, point.z); target.push(geometry);
    };
    const copingCount = Math.max(12, Math.round(radius * 6));
    for (let i = 0; i < copingCount; i++) {
      const angle = i / copingCount * Math.PI * 2, r = radius * (1.02 + rand() * .04);
      const x = center.x + Math.cos(angle) * r, z = center.z + Math.sin(angle) * r;
      if (!this.inside(x, z)) continue;
      const p = this.surface(x, z, .16), size = radius * (.12 + rand() * .025);
      addRock(stone, p, new THREE.Vector3(size, size * .42, size * .65));
      if (i % 3 === 0) addRock(moss, p.clone().add(new THREE.Vector3(0, size * .38, 0)), new THREE.Vector3(size * .7, size * .12, size * .45));
    }
    this.createWater(group, center.x, center.z, radius);
    const config = this.world.getConfig();
    const trees = config.viewMode === 'topographic' ? 0 : config.viewMode === 'scientific' || config.visualQuality === 'performance' ? 1 : 3;
    // Two unequal clusters instead of an evenly spaced ring. No ancestor tree or props.
    const placements = [[-1.45, -.95, 1], [-1.9, -.65, .65], [1.2, -1.25, .78]];
    const tube = (points: THREE.Vector3[], r: number) => wood.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, r, 5, false));
    for (let i = 0; i < trees; i++) {
      const [dx, dz, size] = placements[i], x = center.x + dx * radius, z = center.z + dz * radius;
      if (!this.inside(x, z)) continue;
      const base = this.surface(x, z), h = radius * size * 1.25, lean = (rand() - .3) * h * .2;
      // Skip a tree when a nearby ridge would hide the optimum or break the basin silhouette.
      if (Math.abs(base.y - this.surface(center.x, center.z).y) > Math.max(1.4, radius * .5)) continue;
      tube([base, base.clone().add(new THREE.Vector3(-h * .06, h * .4, h * .05)), base.clone().add(new THREE.Vector3(lean, h, 0))], h * .035);
      for (let j = 0; j < 4; j++) {
        const angle = j * 2.4 + i, spread = h * (.34 - j * .045), start = base.clone().add(new THREE.Vector3(lean * .5, h * (.4 + j * .16), 0));
        const end = start.clone().add(new THREE.Vector3(Math.cos(angle) * spread, h * .06, Math.sin(angle) * spread));
        tube([start, start.clone().lerp(end, .6).add(new THREE.Vector3(0, -h * .03, 0)), end], h * .016);
        for (let k = 0; k < 2; k++) {
          const p = end.clone().add(new THREE.Vector3((rand() - .5) * spread * .4, (rand() - .5) * h * .04, (rand() - .5) * spread * .4));
          addRock(leaves, p, new THREE.Vector3(spread * (.6 + rand() * .12), h * (.09 + rand() * .025), spread * (.45 + rand() * .2)));
        }
      }
    }
    const merge = (geometries: THREE.BufferGeometry[], color: number) => {
      if (!geometries.length) return;
      const geometry = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .94 }));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.isEnvironment = true; group.add(mesh);
    };
    merge(stone, 0x748279); merge(moss, 0x355f46); merge(wood, 0x564d42); merge(leaves, 0x214e3a);
    // Exact x1/x2 remains visible regardless of terrain elevation, water or mode.
    const marker = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.10, Math.min(.24, radius * .065)), 12, 8), new THREE.MeshBasicMaterial({ color: 0xe8f6e9 }));
    marker.position.copy(this.surface(center.x, center.z, .42)); marker.name = 'exact-optimum';
    marker.userData = { isBeacon: true, x1: min.x1, x2: min.x2 }; group.add(marker);
  }

  private createWater(group: THREE.Group, x: number, z: number, radius: number): void {
    const segments = 48, rings = 8, positions: number[] = [], uv: number[] = [], indices: number[] = [], valid: boolean[] = [];
    // Conform to the real surface; decoration cannot bridge a canyon or flatten a valley.
    for (let ring = 0; ring <= rings; ring++) for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2, r = ring / rings * radius;
      const px = x + Math.cos(angle) * r, pz = z + Math.sin(angle) * r;
      const p = this.surface(px, pz, .12); positions.push(p.x, p.y, p.z); uv.push(Math.cos(angle) * ring / rings, Math.sin(angle) * ring / rings); valid.push(this.inside(px, pz));
    }
    for (let ring = 0; ring < rings; ring++) for (let i = 0; i < segments; i++) {
      const a = ring * (segments + 1) + i, b = a + segments + 1;
      for (const triangle of [[a, b, a + 1], [a + 1, b, b + 1]]) if (triangle.every(v => valid[v])) indices.push(...triangle);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: this.waterPhase }, uTwilight: { value: this.atmosphereMix }, uJade: { value: new THREE.Color(0x548f80) }, uDeep: { value: new THREE.Color(0x234f48) }, uNight: { value: new THREE.Color(0x253d58) } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `uniform float uTime; uniform float uTwilight; uniform vec3 uJade; uniform vec3 uDeep; uniform vec3 uNight; varying vec2 vUv;
        void main(){float r=length(vUv); float rip=pow(.5+.5*sin(r*32.-uTime*1.7),20.)*.055;
        vec3 color=mix(uDeep,uJade,smoothstep(.0,1.,r));color=mix(color,uNight,uTwilight*.65)+rip;
        gl_FragColor=vec4(color,.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    this.waterMaterials.push(material);
    const water = new THREE.Mesh(geometry, material); water.name = 'jade-oasis-water'; water.renderOrder = 2; water.userData.isEnvironment = true; group.add(water);
  }

  clear(): void {
    this.sanctuary.dispose(); this.oases.remove(this.sanctuary.group);
    this.oases.traverse(obj => {
      if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; materials.forEach(m => m.dispose()); }
    });
    this.oases.clear(); this.waterMaterials = [];
  }

  setAtmosphere(mode: 'golden-hour' | 'twilight'): void { this.atmosphereTarget = mode === 'twilight' ? 1 : 0; }

  update(deltaTime: number): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.atmosphereMix += (this.atmosphereTarget - this.atmosphereMix) * (1 - Math.exp(-Math.min(deltaTime, .1) / (reduced ? .07 : 1.2)));
    this.waterPhase += Math.min(deltaTime, .1) * (reduced ? .1 : 1);
    this.sanctuary.update(deltaTime, this.atmosphereMix);
    for (const material of this.waterMaterials) { material.uniforms.uTime.value = this.waterPhase; material.uniforms.uTwilight.value = this.atmosphereMix; }
  }

  dispose(): void { this.clear(); this.sceneManager.getWaterGroup().remove(this.oases); }
}
