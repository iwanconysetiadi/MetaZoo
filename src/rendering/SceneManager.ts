import * as THREE from 'three';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { WorldConfiguration } from '../core/math/Types';

export class SceneManager {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private world: OptimizationWorld;
  private config: WorldConfiguration;
  private animationId: number | null = null;
  private lastTime = 0;

  private terrainGroup: THREE.Group;
  private overlayGroup: THREE.Group;
  private markerGroup: THREE.Group;
  private waterGroup: THREE.Group;
  private cloudLayers: THREE.Mesh[] = [];
  private waterfallMeshes: THREE.Mesh[] = [];
  private cloudBank: THREE.Group | null = null;
  private environmentTime = 0;
  private atmosphereValue = 0;
  private atmosphereTarget = 0;
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private readonly atmospherePalette = {
    topGolden: new THREE.Color(0x347c8c), topTwilight: new THREE.Color(0x172b53),
    horizonGolden: new THREE.Color(0xf4a99e), horizonTwilight: new THREE.Color(0xed8b91),
    bottomGolden: new THREE.Color(0x76627f), bottomTwilight: new THREE.Color(0x252b56),
    fogGolden: new THREE.Color(0xe7b8ae), fogTwilight: new THREE.Color(0x263354),
    sunGolden: new THREE.Color(0xffd7a3), sunTwilight: new THREE.Color(0xff9b91),
    ambientGolden: new THREE.Color(0xffe6d6), ambientTwilight: new THREE.Color(0x8794c8),
  };

  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.AxesHelper | null = null;

  constructor(canvas: HTMLCanvasElement, world: OptimizationWorld, config: WorldConfiguration) {
    this.world = world;
    this.config = config;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf7f4f1);

    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 2000);
    this.camera.position.set(80, 80, 80);

    this.terrainGroup = new THREE.Group();
    this.overlayGroup = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.waterGroup = new THREE.Group();

    this.scene.add(this.terrainGroup);
    this.scene.add(this.overlayGroup);
    this.scene.add(this.markerGroup);
    this.scene.add(this.waterGroup);

    this.setupLighting();
    this.setupEnvironment();
    this.setupHelpers();
    this.applyQualityPreset(config.visualQuality);

    window.addEventListener('resize', this.onResize.bind(this));
    // Initial resize to set correct canvas size
    this.onResize();
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xdfe8f5, 0.45);
    this.ambientLight = ambient;
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff3e0, 1.25);
    this.sunLight = sun;
    sun.position.set(95, 105, 72);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -200;
    sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200;
    sun.shadow.camera.bottom = -200;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0x9fb8dd, 0.28);
    fillLight.position.set(-70, 90, -60);
    this.scene.add(fillLight);
  }

  private setupEnvironment(): void {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const skyColor = new THREE.Color(0x8eabb8);
    const skybox = new THREE.Scene();
    skybox.background = skyColor;
    const envMap = pmremGenerator.fromScene(skybox).texture;
    this.scene.environment = envMap;
    pmremGenerator.dispose();

    this.addSkyDome();
    this.addCloudOcean();
    this.addWaterfalls();
    this.addDistantIslands();

    this.scene.fog = new THREE.FogExp2(0xd9c2ce, 0.0007);
  }

  private addSkyDome(): void {
    const skyGeometry = new THREE.SphereGeometry(900, 32, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x347c8c) },
        uHorizon: { value: new THREE.Color(0xf4a99e) },
        uBottom: { value: new THREE.Color(0x76627f) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uBottom;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld).y;
          vec3 color = h > 0.0
            ? mix(uHorizon, uTop, smoothstep(0.0, 0.55, h))
            : mix(uHorizon, uBottom, smoothstep(0.0, 0.4, -h));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.skyMaterial = skyMaterial;

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.name = 'skyDome';
    this.scene.add(sky);
  }

  /** Decorative cloud field. It lives outside the terrain groups and never participates in picking or evaluation. */
  private addCloudOcean(): void {
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const layers = this.config.visualQuality === 'performance'
      ? [{ y: -31, size: 560, scale: 8, opacity: 0.82, offset: 0.17 }]
      : [
        { y: -30, size: 620, scale: 8, opacity: 0.88, offset: 0.17 },
        { y: -43, size: 720, scale: 6, opacity: 0.58, offset: 0.63 },
        ...(this.config.visualQuality === 'presentation' || this.config.visualQuality === 'ultra'
          ? [{ y: -56, size: 820, scale: 5, opacity: 0.34, offset: 0.39 }]
          : []),
      ];

    for (const layer of layers) {
      const geometry = new THREE.PlaneGeometry(layer.size, layer.size, 1, 1);
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uTime: { value: 0 },
          uScale: { value: layer.scale },
          uOpacity: { value: layer.opacity },
          uOffset: { value: layer.offset },
          uDrift: { value: reducedMotion ? 0 : 1 },
          uTwilight: { value: 0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uScale;
          uniform float uOpacity;
          uniform float uOffset;
          uniform float uDrift;
          uniform float uTwilight;
          varying vec2 vUv;
          float hash(vec2 p) {
            p = fract(p * vec2(123.34, 456.21));
            p += dot(p, p + 45.32);
            return fract(p.x * p.y);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
          }
          float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            for (int i = 0; i < 4; i++) {
              value += amplitude * noise(p);
              p = p * 2.02 + 13.1;
              amplitude *= 0.5;
            }
            return value;
          }
          void main() {
            vec2 drift = vec2(uTime * 0.002, -uTime * 0.0013) * uDrift;
            vec2 p = vUv * uScale + drift + uOffset;
            float broad = fbm(p);
            float detail = fbm(p * 2.7 + 7.0);
            float fine = fbm(p * 5.4 - 3.0);
            float body = smoothstep(0.39, 0.67, broad + detail * 0.16 + fine * 0.035);
            float edge = smoothstep(0.02, 0.82, body);
            float alpha = edge * uOpacity * 0.72;
            float lightFacing = smoothstep(0.20, 0.82, body);
            vec3 golden = mix(vec3(0.38, 0.60, 0.73), vec3(1.0, 0.88, 0.76), lightFacing);
            golden = mix(golden, vec3(0.47, 0.76, 0.83), smoothstep(0.48, 0.84, broad) * 0.36);
            vec3 twilight = mix(vec3(0.13, 0.22, 0.39), vec3(0.73, 0.39, 0.55), lightFacing);
            vec3 cloud = mix(golden, twilight, uTwilight);
            gl_FragColor = vec4(cloud, alpha);
          }
        `,
      });
      const cloud = new THREE.Mesh(geometry, material);
      cloud.rotation.x = -Math.PI / 2;
      cloud.position.y = layer.y;
      cloud.renderOrder = 1;
      cloud.userData.isEnvironment = true;
      this.scene.add(cloud);
      this.cloudLayers.push(cloud);
    }

    // Rounded, overlapping cloud puffs add a volumetric horizon around the island.
    // Instancing keeps the detail inexpensive and entirely separate from terrain sampling.
    const qualityCount = this.config.visualQuality === 'performance' ? 24
      : this.config.visualQuality === 'balanced' ? 44 : 68;
    const bank = new THREE.Group();
    const puffGeometry = new THREE.SphereGeometry(1, 12, 8);
    const puffMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      vertexColors: true,
    });
    const puffs = new THREE.InstancedMesh(puffGeometry, puffMaterial, qualityCount);
    const transform = new THREE.Object3D();
    const blue = new THREE.Color(0x8ebbc4);
    const blush = new THREE.Color(0xd7a4a0);
    for (let i = 0; i < qualityCount; i++) {
      const cluster = Math.floor(i / 5);
      const withinCluster = i % 5;
      const angle = (cluster / Math.ceil(qualityCount / 5)) * Math.PI * 2 + withinCluster * 0.075;
      const radius = 75 + ((i * 17) % 41);
      const puffSize = 8 + ((i * 13) % 8);
      transform.position.set(
        Math.cos(angle) * radius,
        -9 + ((i * 7) % 5) * 0.45,
        Math.sin(angle) * radius,
      );
      transform.scale.set(puffSize, puffSize * (0.36 + (i % 3) * 0.05), puffSize * (0.74 + (i % 4) * 0.08));
      transform.rotation.set(0, angle, (i % 5 - 2) * 0.035);
      transform.updateMatrix();
      puffs.setMatrixAt(i, transform.matrix);
      puffs.setColorAt(i, i % 4 === 0 ? blush : blue);
    }
    puffs.instanceMatrix.needsUpdate = true;
    if (puffs.instanceColor) puffs.instanceColor.needsUpdate = true;
    puffs.renderOrder = 0;
    puffs.userData.isEnvironment = true;
    bank.add(puffs);
    bank.userData.isEnvironment = true;
    this.scene.add(bank);
    this.cloudBank = bank;
  }

  /** A few low-detail background silhouettes establish scale without loading extra worlds. */
  private addDistantIslands(): void {
    if (this.config.visualQuality === 'performance') return;
    const islands: Array<[number, number, number, number]> = [
      [-155, 22, -170, 0.82], [172, 7, -125, 0.58], [-182, 13, 112, 0.7], [145, 28, 180, 0.48],
    ];
    for (const [x, y, z, scale] of islands) {
      const group = new THREE.Group();
      const top = new THREE.Mesh(
        new THREE.SphereGeometry(8 * scale, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x9eaf9d, roughness: 1 }),
      );
      top.scale.y = 0.28;
      top.position.y = 5 * scale;
      const underside = new THREE.Mesh(
        new THREE.ConeGeometry(6.5 * scale, 13 * scale, 7, 1),
        new THREE.MeshStandardMaterial({ color: 0x817c7d, roughness: 1, flatShading: true }),
      );
      underside.position.y = -1 * scale;
      group.add(top, underside);
      group.position.set(x, y, z);
      group.userData.isEnvironment = true;
      this.scene.add(group);
    }
  }

  /** Decorative cascades that run from the island rim into the cloud sea. */
  private addWaterfalls(): void {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;
    const cascades = [
      { angle: 0.35, length: 30, width: 4.2 },
      { angle: 1.62, length: 25, width: 3.3 },
      { angle: 2.72, length: 34, width: 4.8 },
      { angle: 4.20, length: 27, width: 3.5 },
      { angle: 5.40, length: 32, width: 4.0 },
    ];
    const rows = 22;
    const columns = 6;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const edgeRadius = (angle: number): number => 0.965
      + 0.035 * Math.sin(angle * 3 + 0.45)
      + 0.022 * Math.sin(angle * 5 - 1.1)
      + 0.012 * Math.sin(angle * 9 + 0.8);

    for (const cascade of cascades) {
      const { angle, length, width } = cascade;
      const edge = edgeRadius(angle);
      const u = 0.5 + Math.cos(angle) * edge * 0.5;
      const v = 0.5 + Math.sin(angle) * edge * 0.5;
      const x1 = x1Min + v * (x1Max - x1Min);
      const x2 = x2Min + u * (x2Max - x2Min);
      const { x: rimX, z: rimZ } = this.world.optimizationToWorld(x1, x2);
      const startY = this.world.sample(x1, x2).normalizedCost * config.verticalScale * 10 - 0.2;
      const base = positions.length / 3;

      for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        const fallY = THREE.MathUtils.lerp(startY, -30, t);
        const radius = edge + 0.018 + Math.sin(t * Math.PI) * 0.018;
        const flowWobble = Math.sin(t * 12 + angle * 3) * 0.65 + Math.sin(t * 23 - angle) * 0.28;
        for (let column = 0; column <= columns; column++) {
          const side = column / columns - 0.5;
          const a = angle + side * width / 65;
          const localRadius = radius + flowWobble / 100;
          const px = Math.cos(a) * localRadius * 50;
          const pz = Math.sin(a) * localRadius * 50;
          positions.push(rimX + px - Math.cos(angle) * edge * 50, fallY, rimZ + pz - Math.sin(angle) * edge * 50);
          uvs.push(column / columns, t);
        }
      }

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const a = base + row * (columns + 1) + column;
          const b = a + 1;
          const c = a + columns + 1;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uWater: { value: new THREE.Color('#a8e5e8') },
        uFoam: { value: new THREE.Color('#f3f8ef') },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uWater;
        uniform vec3 uFoam;
        varying vec2 vUv;
        void main() {
          float edge = smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));
          float fade = 1.0 - smoothstep(0.90, 1.0, vUv.y);
          float streak = pow(0.5 + 0.5 * sin(vUv.y * 76.0 - uTime * 5.0 + sin(vUv.x * 18.0) * 2.2), 5.0);
          float foam = smoothstep(0.77, 0.98, streak) * 0.38;
          vec3 color = mix(uWater, uFoam, foam);
          gl_FragColor = vec4(color, edge * fade * (0.40 + streak * 0.24));
        }
      `,
    });

    const waterfalls = new THREE.Mesh(geometry, material);
    waterfalls.name = 'decorative-waterfalls';
    waterfalls.renderOrder = 3;
    waterfalls.userData.isEnvironment = true;
    this.scene.add(waterfalls);
    this.waterfallMeshes.push(waterfalls);
  }

  private setupHelpers(): void {
    this.gridHelper = new THREE.GridHelper(100, 50, 0x8b98b3, 0xc4cad6);
    this.gridHelper.position.y = -5;
    this.gridHelper.visible = false;
    this.scene.add(this.gridHelper);

    this.axesHelper = new THREE.AxesHelper(60);
    this.axesHelper.position.y = -5;
    this.axesHelper.visible = false;
    this.scene.add(this.axesHelper);
  }

  private applyQualityPreset(quality: WorldConfiguration['visualQuality']): void {
    const presets = {
      performance: { shadowMapSize: 512, pixelRatio: 1, ssao: false, bloom: false, fxaa: true },
      balanced: { shadowMapSize: 1024, pixelRatio: 1.5, ssao: false, bloom: false, fxaa: true },
      presentation: { shadowMapSize: 2048, pixelRatio: 2, ssao: true, bloom: true, fxaa: true },
      ultra: { shadowMapSize: 4096, pixelRatio: 2, ssao: true, bloom: true, fxaa: true },
    };

    const preset = presets[quality];
    this.renderer.setPixelRatio(Math.min(preset.pixelRatio, window.devicePixelRatio));

    this.scene.traverse(obj => {
      if (obj instanceof THREE.DirectionalLight && obj.shadow) {
        obj.shadow.mapSize.width = preset.shadowMapSize;
        obj.shadow.mapSize.height = preset.shadowMapSize;
      }
    });
  }

  private onResize(): void {
    const canvas = this.renderer.domElement;
    const width = Math.max(1, canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.camera;
  }

  getTerrainGroup(): THREE.Group {
    return this.terrainGroup;
  }

  getOverlayGroup(): THREE.Group {
    return this.overlayGroup;
  }

  getMarkerGroup(): THREE.Group {
    return this.markerGroup;
  }

  getWaterGroup(): THREE.Group {
    return this.waterGroup;
  }

  setCameraPosition(x: number, y: number, z: number): void {
    this.camera.position.set(x, y, z);
  }

  setCameraTarget(x: number, y: number, z: number): void {
    this.camera.lookAt(x, y, z);
  }

  startRenderLoop(renderCallback: (deltaTime: number) => void): void {
    const animate = (time: number) => {
      this.animationId = requestAnimationFrame(animate);
      const deltaTime = (time - this.lastTime) / 1000;
      this.lastTime = time;
      this.environmentTime += Math.min(deltaTime, 0.1);
      for (const cloud of this.cloudLayers) {
        const material = cloud.material as THREE.ShaderMaterial;
        material.uniforms.uTime.value = this.environmentTime;
      }
      for (const waterfall of this.waterfallMeshes) {
        (waterfall.material as THREE.ShaderMaterial).uniforms.uTime.value = this.environmentTime;
      }
      if (this.cloudBank) this.cloudBank.rotation.y = this.environmentTime * 0.0015;
      this.updateAtmosphere(deltaTime);
      renderCallback(deltaTime);
      this.renderer.render(this.scene, this.camera);
    };
    this.lastTime = performance.now();
    animate(this.lastTime);
  }

  setAtmosphere(mode: 'golden-hour' | 'twilight'): void {
    this.atmosphereTarget = mode === 'twilight' ? 1 : 0;
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      this.atmosphereValue = this.atmosphereTarget;
      this.updateAtmosphere(0);
    }
  }

  private updateAtmosphere(deltaTime: number): void {
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const blend = reducedMotion ? this.atmosphereTarget
      : this.atmosphereValue + (this.atmosphereTarget - this.atmosphereValue) * (1 - Math.exp(-Math.max(0, deltaTime) / 0.9));
    this.atmosphereValue = blend;
    const palette = this.atmospherePalette;
    const sky = this.skyMaterial;
    if (sky) {
      (sky.uniforms.uTop.value as THREE.Color).lerpColors(palette.topGolden, palette.topTwilight, blend);
      (sky.uniforms.uHorizon.value as THREE.Color).lerpColors(palette.horizonGolden, palette.horizonTwilight, blend);
      (sky.uniforms.uBottom.value as THREE.Color).lerpColors(palette.bottomGolden, palette.bottomTwilight, blend);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerpColors(palette.fogGolden, palette.fogTwilight, blend);
      this.scene.fog.density = THREE.MathUtils.lerp(0.0007, 0.00105, blend);
    }
    if (this.sunLight) {
      this.sunLight.color.lerpColors(palette.sunGolden, palette.sunTwilight, blend);
      this.sunLight.intensity = THREE.MathUtils.lerp(1.15, 0.62, blend);
    }
    if (this.ambientLight) {
      this.ambientLight.color.lerpColors(palette.ambientGolden, palette.ambientTwilight, blend);
      this.ambientLight.intensity = THREE.MathUtils.lerp(0.50, 0.34, blend);
    }
    for (const cloud of this.cloudLayers) {
      (cloud.material as THREE.ShaderMaterial).uniforms.uTwilight.value = blend;
    }
  }

  stopRenderLoop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.stopRenderLoop();
    window.removeEventListener('resize', this.onResize.bind(this));
    this.renderer.dispose();
    this.scene.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  updateQuality(quality: WorldConfiguration['visualQuality']): void {
    this.config.visualQuality = quality;
    this.applyQualityPreset(quality);
  }

  setFogEnabled(enabled: boolean): void {
    this.scene.fog = enabled ? new THREE.FogExp2(0xf4ece7, 0.0015) : null;
  }

  setGridVisible(visible: boolean): void {
    if (this.gridHelper) this.gridHelper.visible = visible;
  }

  setAxesVisible(visible: boolean): void {
    if (this.axesHelper) this.axesHelper.visible = visible;
  }
}
