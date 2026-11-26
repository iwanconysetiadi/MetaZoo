import * as THREE from 'three';
import { VISUAL, ENVIRONMENT_QUALITY, applyVisualTokens } from './VisualTheme';
import { CloudSystem } from './CloudSystem';
import { islandEdgeRadius } from '../core/world/IslandProjection';
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
  private cloudSystem!: CloudSystem;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private waterfallMeshes: THREE.Mesh[] = [];
  private waterDetails = new THREE.Group();
  private mistTexture: THREE.CanvasTexture | null = null;

  private environmentTime = 0;
  private atmosphereValue = 0;
  private atmosphereTarget = 0;
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  private readonly atmospherePalette = {
    topGolden: new THREE.Color(VISUAL.skyDeep), topTwilight: new THREE.Color('#26384f'),
    midGolden: new THREE.Color(VISUAL.skyMid), midTwilight: new THREE.Color('#425a70'),
    horizonGolden: new THREE.Color(VISUAL.horizon), horizonTwilight: new THREE.Color('#adb8be'),
    bottomGolden: new THREE.Color(VISUAL.skyLight), bottomTwilight: new THREE.Color('#526a7a'),
    fogGolden: new THREE.Color('#afc5d2'), fogTwilight: new THREE.Color('#748b9c'),
    sunGolden: new THREE.Color('#ffd7a6'), sunTwilight: new THREE.Color('#e8be9c'),
    ambientGolden: new THREE.Color('#aabcc4'), ambientTwilight: new THREE.Color('#8babc0'),
  };

  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.AxesHelper | null = null;

  constructor(canvas: HTMLCanvasElement, world: OptimizationWorld, config: WorldConfiguration) {
    applyVisualTokens();
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
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(VISUAL.skyMid);

    const aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(43, aspect, 0.1, 2000);
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
    const ambient = new THREE.AmbientLight(0xaabcc4, 0.20);
    this.ambientLight = ambient;
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffd7a6, 2.2);
    this.sunLight = sun;
    sun.position.set(-110, 140, -90);
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

    this.scene.add(new THREE.HemisphereLight(0xb8d0dc, 0x3f4948, 1.1));
    const fillLight = new THREE.DirectionalLight(0x9fb8dd, 0.28);
    fillLight.position.set(-70, 90, -60);
    this.scene.add(fillLight);
    const bounce = new THREE.DirectionalLight(0xc8dbe1,.65);
    bounce.position.set(20,-100,50); this.scene.add(bounce);
  }

  private setupEnvironment(): void {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const skyColor = new THREE.Color(VISUAL.skyMid);
    const skybox = new THREE.Scene();
    skybox.background = skyColor;
    const envMap = pmremGenerator.fromScene(skybox).texture;
    this.scene.environment = envMap;
    pmremGenerator.dispose();

    this.addSkyDome();
    this.cloudSystem = new CloudSystem(this.config.visualQuality);
    this.scene.add(this.cloudSystem.group);
    this.scene.add(this.waterDetails);
    this.addWaterfalls();
    this.addDistantIslands();

    this.scene.fog = new THREE.FogExp2(0xafc5d2, 0.0018);
  }

  private addSkyDome(): void {
    const skyGeometry = new THREE.SphereGeometry(900, 32, 16);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(VISUAL.skyDeep) },
        uMid: { value: new THREE.Color(VISUAL.skyMid) },
        uHorizon: { value: new THREE.Color(VISUAL.horizon) },
        uBottom: { value: new THREE.Color(VISUAL.skyLight) },
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
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uBottom;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld).y;
          vec3 color = h > 0.0
            ? mix(uMid, uTop, .22 + .78 * smoothstep(0.0, .55, h))
            : mix(uMid, uBottom, smoothstep(0.0, .65, -h));
          float horizonBand = exp(-pow((h - .005) * 28.0, 2.0));
          color = mix(color, uHorizon, horizonBand * .28);
          color += vec3(.025,.014,.002) * horizonBand;
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.skyMaterial = skyMaterial;

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.name = 'skyDome';
    this.scene.add(sky);
  }

  /** A few low-detail background silhouettes establish scale without loading extra worlds. */
  private addDistantIslands(): void {

    const islands: Array<[number, number, number, number]> = [
      [-175, 30, -250, 2.2], [205, 18, -210, 1.55], [-285, 23, 50, 1.7], [60, 39, -340, 1.3], [40, 55, -300, 0.65],
    ];
    for (const [x, y, z, scale] of islands.slice(0, ENVIRONMENT_QUALITY[this.config.visualQuality].islands)) {
      const group = new THREE.Group();
      const top = new THREE.Mesh(
        new THREE.SphereGeometry(8 * scale, 12, 8),
        new THREE.MeshStandardMaterial({ color: 0x7d969e, roughness: 1 }),
      );
      top.scale.y = 0.28;
      top.position.y = 5 * scale;
      const underside = new THREE.Mesh(
        new THREE.IcosahedronGeometry(6.5 * scale, 1),
        new THREE.MeshStandardMaterial({ color: 0x697e88, roughness: 1, flatShading: true }),
      );
      underside.scale.set(.9,1.55,.8); underside.rotation.set(.12,scale*.8,.14);
      underside.position.y = -1 * scale;
      group.add(top, underside);
      group.position.set(x * 1.38, y, z * 1.38);
      group.userData.isEnvironment = true;
      this.scene.add(group);
    }
  }

  /** Decorative cascades that run from the island rim into the cloud sea. */
  rebuildWaterfalls(): void {
    for (const mesh of this.waterfallMeshes) {
      this.scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
    }
    this.waterfallMeshes = [];
    this.waterDetails.traverse(obj => {
      if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); (obj.material as THREE.Material).dispose(); }
      if (obj instanceof THREE.Sprite) obj.material.dispose();
    });
    this.waterDetails.clear();
    this.addWaterfalls();
  }

  private addWaterfalls(): void {
    const config = this.world.getConfig();
    const { x1Min, x1Max, x2Min, x2Max } = config.domain;
    const minimal = config.functionId === 'sphere' || config.visualQuality === 'performance';
    const cascades = [
      { angle: .62, length: 130, width: 7.2 },
      ...(!minimal ? [{ angle: 2.72, length: 137, width: 4.7 }] : []),
    ].flatMap(cascade => [
      {...cascade,angle:cascade.angle-.016,width:cascade.width*.43},
      {...cascade,angle:cascade.angle+.008,width:cascade.width*.34},
      {...cascade,angle:cascade.angle+.026,width:cascade.width*.23},
    ]);
    const rows = 44;
    const columns = 6;
    const worldRadius = 90;
    const positions: number[] = [];
    const uvs: number[] = [];
    const tangents: number[] = [];
    const phases: number[] = [];
    const indices: number[] = [];

    for (let cascadeIndex = 0; cascadeIndex < cascades.length; cascadeIndex++) {
      const cascade = cascades[cascadeIndex];
      const { angle, length, width } = cascade;
      const edge = islandEdgeRadius(angle);
      const squareEdge = 1 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
      const u = 0.5 + Math.sin(angle) * squareEdge * 0.5;
      const v = 0.5 + Math.cos(angle) * squareEdge * 0.5;
      const x1 = x1Min + v * (x1Max - x1Min);
      const x2 = x2Min + u * (x2Max - x2Min);
      const rimX = Math.cos(angle) * edge * worldRadius;
      const rimZ = Math.sin(angle) * edge * worldRadius;
      const startY = this.world.getTerrainSurfaceHeight(x1, x2) - 0.2;
      if(cascadeIndex%3===0) {
      const tangent = new THREE.Vector3(-Math.sin(angle),0,Math.cos(angle));
      const wetMaterial = new THREE.MeshStandardMaterial({color:0x47595b,roughness:.62,flatShading:true});
      for (const side of [-1,1]) {
        const wet = new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),wetMaterial.clone());
        wet.position.set(rimX + tangent.x * width * side * .62,startY-.6,rimZ+tangent.z*width*side*.62);
        wet.scale.set(2.4,1.2,2.4); this.waterDetails.add(wet);
      }
      wetMaterial.dispose();
      // A short stone spillway and dark water connect the lip to its source.
      const lip = new THREE.Mesh(new THREE.BoxGeometry(5.5,.55,width*.8),new THREE.MeshStandardMaterial({color:0x315c5a,roughness:.32,transparent:true,opacity:.62}));
      lip.position.set(rimX-Math.cos(angle)*2.4,startY+.10,rimZ-Math.sin(angle)*2.4);
      lip.rotation.y=-angle;this.waterDetails.add(lip);
      if (!this.mistTexture) {
        const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
        const ctx=canvas.getContext('2d')!;const grad=ctx.createRadialGradient(32,32,0,32,32,32);
        grad.addColorStop(0,'rgba(244,247,243,.7)');grad.addColorStop(.35,'rgba(219,233,236,.25)');grad.addColorStop(1,'rgba(219,233,236,0)');
        ctx.fillStyle=grad;ctx.fillRect(0,0,64,64);this.mistTexture=new THREE.CanvasTexture(canvas);this.mistTexture.colorSpace=THREE.SRGBColorSpace;
      }
      const mistCount=config.visualQuality==='performance'?2:4;
      for(let i=0;i<mistCount;i++) {
        const mist=new THREE.Sprite(new THREE.SpriteMaterial({map:this.mistTexture,transparent:true,opacity:.28,depthWrite:false,color:0xd7e1e5}));
        mist.position.set(rimX+tangent.x*(i-1.5)*2.1,-108-i*5,rimZ+tangent.z*(i-1.5)*2.1);
        mist.scale.set(9+i*3,14+i*3,1);mist.userData.baseY=mist.position.y;mist.userData.phase=i*1.7;
        this.waterDetails.add(mist);
      }
      }
      const base = positions.length / 3;

      for (let row = 0; row <= rows; row++) {
        const t = row / rows;
        const phase = cascadeIndex * 1.71;
        const centerAngle = angle + Math.sin(t * 4.2 + phase) * .004 * t + Math.sin(t * 10.5 - phase) * .002 * t;
        const fallY = THREE.MathUtils.lerp(startY, -length, t) + Math.sin(t * 5.5 + phase) * 0.42 * t;
        const radius = edge + .004 + (1 - Math.exp(-t * 8)) * .028;
        const flowWobble = Math.sin(t * 12 + phase) * 0.72 + Math.sin(t * 23 - phase) * 0.24;
        const widthProfile = 1.0 - t * .30 + Math.sin(t * 8 + phase) * .025;
        for (let column = 0; column <= columns; column++) {
          const side = column / columns - 0.5;
          const a = centerAngle + side * width * widthProfile / worldRadius;
          const localRadius = radius + flowWobble * t / 400;
          const px = Math.cos(a) * localRadius * worldRadius;
          const pz = Math.sin(a) * localRadius * worldRadius;
          positions.push(rimX + px - Math.cos(angle) * edge * worldRadius, fallY + Math.sin(column * 2.1 + phase) * 0.12, rimZ + pz - Math.sin(angle) * edge * worldRadius);
          uvs.push(column / columns, t);
          tangents.push(-Math.sin(centerAngle), 0, Math.cos(centerAngle));
          phases.push(phase);
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
    geometry.setAttribute('aTangent', new THREE.Float32BufferAttribute(tangents, 3));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uTwilight: { value: 0 },
        uWater: { value: new THREE.Color('#bfdce0') },
        uShadow: { value: new THREE.Color('#7ea6b2') },
        uFoam: { value: new THREE.Color('#e9f4f2') },
      },
      vertexShader: `
        attribute vec3 aTangent;
        attribute float aPhase;
        uniform float uTime;
        varying vec2 vUv;
        varying float vPhase;
        void main() {
          vUv = uv;
          float sway = sin(uv.y * 7.2 - uTime * 1.55 + aPhase) * 0.72
            + sin(uv.y * 15.0 - uTime * 2.1 + aPhase * 1.7) * 0.24;
          vec3 p = position + aTangent * sway * uv.y * .2;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          vPhase = aPhase;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uWater;
        uniform float uTwilight;
        uniform vec3 uShadow;
        uniform vec3 uFoam;
        varying vec2 vUv;
        varying float vPhase;
        void main() {
          float across = abs(vUv.x * 2.0 - 1.0);
          float brokenEdge = 0.80 + 0.11 * sin(vUv.y * 11.0 - uTime * 0.7 + vPhase)
            + 0.06 * sin(vUv.y * 23.0 + vPhase * 1.9);
          float edge = 1.0 - smoothstep(brokenEdge - 0.10, brokenEdge + 0.035, across);
          float flow = vUv.y * 65.0 - uTime * 5.4 + sin(vUv.x * 38.0 + vPhase) * .6;
          float streak = pow(0.5 + 0.5 * sin(flow), 7.0);
          float ripple = pow(0.5 + 0.5 * sin(flow * 0.43 + vPhase), 12.0);
          float fadeIn = smoothstep(0.0, 0.035, vUv.y);
          float fadeOut = 1.0 - smoothstep(0.80, 1.0, vUv.y);
          float foam = clamp(streak * 0.52 + ripple * 0.42, 0.0, 0.7);
          float depth = 0.12 + 0.14 * sin(vUv.x * 7.0 + vUv.y * 5.0 + vPhase);
          vec3 color = mix(uWater, uShadow, depth);
          color = mix(color, uFoam, foam);
          color = mix(color,mix(vec3(.47,.59,.69),vec3(.69,.78,.83),foam),uTwilight*.5);
          float strands = pow(.5 + .5 * sin(vUv.x * 33.0 + sin(vUv.y * 7.0 - uTime) * .6), 3.0);
          float alpha = edge * fadeIn * fadeOut * (.10 + streak * .24 + strands * .44) * (1.0 - vUv.y * .5);
          gl_FragColor = vec4(color, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });

    const waterfalls = new THREE.Mesh(geometry, material);
    waterfalls.name = 'decorative-waterfalls';
    waterfalls.renderOrder = 3;
    waterfalls.userData.isEnvironment = true;
    this.scene.add(waterfalls);
    this.waterfallMeshes.push(waterfalls);
    this.waterDetails.traverse(obj => { obj.userData.semanticLayer='ISLAND_DECORATION'; obj.userData.isEnvironment=true; });
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
    const preset = ENVIRONMENT_QUALITY[quality];
    const mobile = window.innerWidth < 700;
    this.renderer.setPixelRatio(Math.min(preset.dpr, mobile ? 1.5 : 2, window.devicePixelRatio));
    this.cloudSystem?.setQuality(quality);

    this.scene.traverse(obj => {
      if (obj instanceof THREE.DirectionalLight && obj.shadow) {
        obj.shadow.mapSize.width = (mobile ? 512 : preset.shadow);
        obj.shadow.mapSize.height = (mobile ? 512 : preset.shadow);
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

  getLightingState(): { sun: THREE.Color; horizon: THREE.Color; mix: number } {
    return {sun:this.sunLight!.color,horizon:this.atmospherePalette.fogGolden.clone().lerp(this.atmospherePalette.fogTwilight,this.atmosphereValue),mix:this.atmosphereValue};
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
      const motion = this.reducedMotion ? .05 : document.body.classList.contains('sim-active') ? .7 : 1;
      this.cloudSystem.update(deltaTime, this.atmosphereValue, motion);
      for (const waterfall of this.waterfallMeshes) {
        (waterfall.material as THREE.ShaderMaterial).uniforms.uTime.value = this.environmentTime * (this.reducedMotion ? .05 : 1);
        (waterfall.material as THREE.ShaderMaterial).uniforms.uTwilight.value = this.atmosphereValue;
      }
      for (const child of this.waterDetails.children) if (child instanceof THREE.Sprite) {
        child.position.y = child.userData.baseY + Math.sin(this.environmentTime*.13+child.userData.phase)*1.1*motion;
      }
      this.updateAtmosphere(deltaTime);
      renderCallback(deltaTime);
      this.renderer.render(this.scene, this.camera);
    };
    this.lastTime = performance.now();
    animate(this.lastTime);
  }

  setAtmosphere(mode: 'golden-hour' | 'twilight'): void {
    this.atmosphereTarget = mode === 'twilight' ? 1 : 0;
  }

  private updateAtmosphere(deltaTime: number): void {
    const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const blend = this.atmosphereValue + (this.atmosphereTarget - this.atmosphereValue) * (1 - Math.exp(-Math.max(0, deltaTime) / (reducedMotion ? .07 : 1.2)));
    this.atmosphereValue = blend;
    const palette = this.atmospherePalette;
    const sky = this.skyMaterial;
    if (sky) {
      (sky.uniforms.uTop.value as THREE.Color).lerpColors(palette.topGolden, palette.topTwilight, blend);
      (sky.uniforms.uMid.value as THREE.Color).lerpColors(palette.midGolden, palette.midTwilight, blend);
      (sky.uniforms.uHorizon.value as THREE.Color).lerpColors(palette.horizonGolden, palette.horizonTwilight, blend);
      (sky.uniforms.uBottom.value as THREE.Color).lerpColors(palette.bottomGolden, palette.bottomTwilight, blend);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerpColors(palette.fogGolden, palette.fogTwilight, blend);
      this.scene.fog.density = this.config.functionId === 'sphere' ? THREE.MathUtils.lerp(.0009,.0013,blend) : THREE.MathUtils.lerp(0.0018,0.0022,blend);
    }
    if (this.sunLight) {
      this.sunLight.color.lerpColors(palette.sunGolden, palette.sunTwilight, blend);
      this.sunLight.intensity = THREE.MathUtils.lerp(2.2, 1.0, blend);
    }
    if (this.ambientLight) {
      this.ambientLight.color.lerpColors(palette.ambientGolden, palette.ambientTwilight, blend);
      this.ambientLight.intensity = THREE.MathUtils.lerp(0.20, 0.18, blend);
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
    this.cloudSystem.dispose();
    this.mistTexture?.dispose();
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
    this.scene.fog = enabled ? new THREE.FogExp2(0xafc5d2, 0.0018) : null;
  }

  setGridVisible(visible: boolean): void {
    if (this.gridHelper) this.gridHelper.visible = visible;
  }

  setAxesVisible(visible: boolean): void {
    if (this.axesHelper) this.axesHelper.visible = visible;
  }
}
