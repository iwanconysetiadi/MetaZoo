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
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff3e0, 1.25);
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

    const skyColor = new THREE.Color(0x8aa6c2);
    const skybox = new THREE.Scene();
    skybox.background = skyColor;
    const envMap = pmremGenerator.fromScene(skybox).texture;
    this.scene.environment = envMap;
    pmremGenerator.dispose();

    this.addSkyDome();

    this.scene.fog = new THREE.FogExp2(0xf4ece7, 0.0009);
  }

  private addSkyDome(): void {
    const skyGeometry = new THREE.SphereGeometry(900, 32, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0xf1f4fb) },
        uHorizon: { value: new THREE.Color(0xf8eee9) },
        uBottom: { value: new THREE.Color(0xf3eae5) },
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

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.name = 'skyDome';
    this.scene.add(sky);
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
      renderCallback(deltaTime);
      this.renderer.render(this.scene, this.camera);
    };
    this.lastTime = performance.now();
    animate(this.lastTime);
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
