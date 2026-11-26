import { ProbeData } from '../core/math/Types';

export class ProbeHUD {
  private container: HTMLElement;
  private visible = false;
  private currentData: ProbeData | null = null;
  private pinnedData: ProbeData[] = [];

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'probe-hud';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      min-width: 300px;
      max-width: 600px;
      background: rgba(10, 10, 20, 0.98);
      border: 1px solid #00ff88;
      border-radius: 8px;
      padding: 16px;
      color: #e0e0e0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.8;
      z-index: 200;
      box-shadow: 0 8px 32px rgba(0,255,136,0.2), 0 0 0 1px rgba(0,255,136,0.1);
      display: none;
      pointer-events: none;
    `;
    document.body.appendChild(this.container);
  }

  show(data: ProbeData | null): void {
    this.currentData = data;
    this.visible = true;
    this.render();
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
  }

  setPinnedProbes(probes: ProbeData[]): void {
    this.pinnedData = probes;
    this.render();
  }

  private render(): void {
    if (!this.visible) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'block';

    let html = '';

    if (this.currentData) {
      const d = this.currentData;
      html += `
        <div style="border-bottom: 1px solid #00ff8844; padding-bottom: 12px; margin-bottom: 12px;">
          <div style="color: #00ff88; font-weight: bold; margin-bottom: 8px;">📍 Live Probe</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
            <span style="color: #888;">x₁:</span> <strong>${d.x1.toFixed(6)}</strong>
            <span style="color: #888;">x₂:</span> <strong>${d.x2.toFixed(6)}</strong>
            <span style="color: #888;">f(x):</span> <strong>${d.cost.toFixed(6)}</strong>
            <span style="color: #888;">Norm:</span> <strong>${d.normalizedCost.toFixed(4)}</strong>
            <span style="color: #888;">∂f/∂x₁:</span> <strong>${d.gradientX.toExponential(3)}</strong>
            <span style="color: #888;">∂f/∂x₂:</span> <strong>${d.gradientZ.toExponential(3)}</strong>
            <span style="color: #888;">|∇f|:</span> <strong>${d.gradientMagnitude.toExponential(3)}</strong>
            <span style="color: #888;">Slope:</span> <strong>${d.slope.toFixed(4)} rad</strong>
            <span style="color: #888;">Curvature:</span> <strong>${d.curvature.toFixed(4)}</strong>
            ${d.basinId !== undefined ? `<span style="color: #888;">Basin:</span> <strong>${d.basinId}</strong>` : ''}
          </div>
        </div>
      `;
    }

    if (this.pinnedData.length > 0) {
      html += `<div style="color: #ff00ff; font-weight: bold; margin-bottom: 8px;">📌 Pinned Probes (${this.pinnedData.length})</div>`;
      this.pinnedData.forEach((d, i) => {
        html += `
          <div style="margin-bottom: 8px; padding: 8px; background: rgba(255,0,255,0.05); border-radius: 4px; border-left: 2px solid #ff00ff;">
            <div style="color: #ff00ff;">#${i + 1}</div>
            <div style="font-size: 11px;">
              (${d.x1.toFixed(4)}, ${d.x2.toFixed(4)}) | f=${d.cost.toFixed(4)} | |∇f|=${d.gradientMagnitude.toExponential(2)}
            </div>
          </div>
        `;
      });
    }

    if (!this.currentData && this.pinnedData.length === 0) {
      html = '<div style="color: #666; text-align: center; padding: 20px;">Hover terrain to probe. Click to pin.</div>';
    }

    this.container.innerHTML = html;
  }

  dispose(): void {
    this.container.remove();
  }
}