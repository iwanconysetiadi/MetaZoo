export class PerformanceHUD {
  private container: HTMLElement;
  private visible = false;
  private stats = {
    fps: 0,
    frameTime: 0,
    drawCalls: 0,
    triangles: 0,
    gpuMemory: 0,
    samplingResolution: 0,
    terrainRebuildTime: 0,
    cpuSamplingTime: 0,
  };
  private frameTimes: number[] = [];
  private lastTime = performance.now();
  private updateInterval: number | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'performance-hud';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 280px;
      background: rgba(10, 10, 20, 0.95);
      border: 1px solid #334;
      border-radius: 8px;
      padding: 12px;
      color: #e0e0e0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      line-height: 1.7;
      z-index: 100;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      display: none;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  }

  show(): void {
    this.visible = true;
    this.container.style.display = 'block';
    this.startMonitoring();
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
    this.stopMonitoring();
  }

  setVisible(visible: boolean): void {
    if (visible) this.show(); else this.hide();
  }

  private startMonitoring(): void {
    this.updateInterval = window.setInterval(() => this.updateDisplay(), 500);
    requestAnimationFrame(() => this.measureFrame());
  }

  private stopMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private measureFrame(): void {
    const now = performance.now();
    const frameTime = now - this.lastTime;
    this.lastTime = now;

    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > 60) this.frameTimes.shift();

    this.stats.fps = 1000 / (this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length);
    this.stats.frameTime = frameTime;

    if (this.visible) {
      requestAnimationFrame(() => this.measureFrame());
    }
  }

  updateDrawCalls(calls: number): void {
    this.stats.drawCalls = calls;
  }

  updateTriangles(tris: number): void {
    this.stats.triangles = tris;
  }

  updateGPUMemory(mb: number): void {
    this.stats.gpuMemory = mb;
  }

  updateSamplingResolution(res: number): void {
    this.stats.samplingResolution = res;
  }

  updateTerrainRebuildTime(ms: number): void {
    this.stats.terrainRebuildTime = ms;
  }

  updateCPUSamplingTime(ms: number): void {
    this.stats.cpuSamplingTime = ms;
  }

  private updateDisplay(): void {
    if (!this.visible) return;

    const s = this.stats;
    const fpsColor = s.fps >= 55 ? '#00ff88' : s.fps >= 30 ? '#ffaa00' : '#ff4444';

    this.container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #334; padding-bottom: 8px;">
        <strong>Performance</strong>
        <span style="color: ${fpsColor};">${s.fps.toFixed(1)} FPS</span>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px;">
        <span style="color: #888;">Frame Time:</span> <strong>${s.frameTime.toFixed(2)} ms</strong>
        <span style="color: #888;">Draw Calls:</span> <strong>${s.drawCalls}</strong>
        <span style="color: #888;">Triangles:</span> <strong>${(s.triangles / 1000).toFixed(1)}k</strong>
        <span style="color: #888;">GPU Mem:</span> <strong>${s.gpuMemory.toFixed(0)} MB</strong>
        <span style="color: #888;">Resolution:</span> <strong>${s.samplingResolution}²</strong>
        <span style="color: #888;">Rebuild:</span> <strong>${s.terrainRebuildTime.toFixed(1)} ms</strong>
        <span style="color: #888;">Sampling:</span> <strong>${s.cpuSamplingTime.toFixed(1)} ms</strong>
      </div>
    `;
  }

  dispose(): void {
    this.stopMonitoring();
    this.container.remove();
  }
}