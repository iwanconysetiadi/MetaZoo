import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { CriticalPoint } from '../core/math/Types';

export class AnalysisPanel {
  private container: HTMLElement;
  private world: OptimizationWorld;
  private updateInterval: number | null = null;

  constructor(world: OptimizationWorld) {
    this.world = world;
    this.container = document.createElement('div');
    this.container.id = 'analysis-panel';
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 300px;
      max-height: 40vh;
      overflow-y: auto;
      background: rgba(20, 20, 40, 0.95);
      border: 1px solid #334;
      border-radius: 8px;
      padding: 16px;
      color: #e0e0e0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.5;
      z-index: 100;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      display: none;
    `;
    document.body.appendChild(this.container);
  }

  startAutoUpdate(intervalMs: number = 500): void {
    this.updateInterval = window.setInterval(() => this.update(), intervalMs);
    this.update();
  }

  stopAutoUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  update(): void {
    const points = this.world.getCriticalPoints();
    const basins = this.world.getBasinMap();
    
    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid #334; padding-bottom: 8px;">
        <strong>Landscape Analysis</strong>
        <span style="color: #00ff88; font-size: 11px;">${points.length} critical points</span>
      </div>
    `;

    const globalMin = points.filter(p => p.type === 'global-minimum');
    const localMin = points.filter(p => p.type === 'local-minimum');
    const localMax = points.filter(p => p.type === 'local-maximum');
    const saddles = points.filter(p => p.type === 'saddle');

    html += this.renderPointGroup('Global Minima', globalMin, '#00ff88');
    html += this.renderPointGroup('Local Minima', localMin, '#ffaa00');
    html += this.renderPointGroup('Local Maxima', localMax, '#ff4444');
    html += this.renderPointGroup('Saddle Points', saddles, '#8888ff');

    if (basins) {
      html += `
        <div style="margin-top: 12px; border-top: 1px solid #334; padding-top: 8px;">
          <strong>Attraction Basins (${basins.basins.length}):</strong>
          ${basins.basins.map(b => `
            <div style="margin: 4px 0; padding: 4px 8px; background: ${b.color}22; border-radius: 4px; border-left: 2px solid ${b.color};">
              Basin ${b.id}: (${b.minimum.x1.toFixed(3)}, ${b.minimum.x2.toFixed(3)})
            </div>
          `).join('')}
        </div>
      `;
    }

    this.container.innerHTML = html;
  }

  private renderPointGroup(title: string, points: CriticalPoint[], color: string): string {
    if (points.length === 0) return '';
    return `
      <div style="margin-bottom: 8px;">
        <div style="color: ${color}; margin-bottom: 4px;"><strong>${title} (${points.length})</strong></div>
        ${points.map(p => `
          <div style="margin: 2px 0; padding: 4px 8px; background: ${color}11; border-radius: 4px; font-size: 11px;">
            (${p.x1.toFixed(4)}, ${p.x2.toFixed(4)}) = ${p.value.toFixed(4)}
            ${p.hessianEigenvalues ? `<br>λ: [${p.hessianEigenvalues[0].toFixed(2)}, ${p.hessianEigenvalues[1].toFixed(2)}]` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  show(): void {
    this.container.style.display = 'block';
    this.update();
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
  }

  dispose(): void {
    this.stopAutoUpdate();
    this.container.remove();
  }
}