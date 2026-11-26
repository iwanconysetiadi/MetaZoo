import { OptimizationWorld } from '../core/world/OptimizationWorld';
import { CostFunctionDefinition } from '../core/math/Types';
import { globalRegistry } from '../core/math/CostFunction';

export class FunctionPanel {
  private container: HTMLElement;
  private world: OptimizationWorld;
  private currentFunction: CostFunctionDefinition | null = null;

  constructor(world: OptimizationWorld) {
    this.world = world;
    this.container = document.createElement('div');
    this.container.id = 'function-panel';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      max-height: 80vh;
      overflow-y: auto;
      background: rgba(20, 20, 40, 0.95);
      border: 1px solid #334;
      border-radius: 8px;
      padding: 16px;
      color: #e0e0e0;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      line-height: 1.6;
      z-index: 100;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    `;
    document.body.appendChild(this.container);
    this.update();
  }

  update(): void {
    const fn = this.world.getFunction();
    this.currentFunction = fn.definition;
    this.render();
  }

  private render(): void {
    if (!this.currentFunction) return;

    const fn = this.currentFunction;
    const minima = fn.knownGlobalMinima;
    const localMinima = fn.knownLocalMinima ?? [];

    this.container.innerHTML = `
      <div style="border-bottom: 1px solid #334; padding-bottom: 12px; margin-bottom: 12px;">
        <h2 style="margin: 0 0 4px 0; color: #00ff88; font-size: 18px;">${fn.name}</h2>
        <div style="color: #888; font-size: 12px;">${fn.shortName} · ${fn.functionClass}</div>
      </div>
      
      <div style="margin-bottom: 12px;">
        <strong>Description:</strong>
        <p style="margin: 4px 0 0 0; color: #aaa;">${fn.metadata.description}</p>
      </div>
      
      <div style="margin-bottom: 12px;">
        <strong>Difficulty:</strong> ${fn.metadata.difficulty}<br>
        <strong>Topology:</strong> ${fn.metadata.topologyNotes}
      </div>

      <div style="margin-bottom: 12px;">
        <strong>Domain:</strong><br>
        x₁ ∈ [${fn.domain.x1Min.toFixed(2)}, ${fn.domain.x1Max.toFixed(2)}]<br>
        x₂ ∈ [${fn.domain.x2Min.toFixed(2)}, ${fn.domain.x2Max.toFixed(2)}]
      </div>

      <div style="margin-bottom: 12px;">
        <strong>Equation:</strong>
        <pre style="margin: 4px 0; padding: 8px; background: #111; border-radius: 4px; overflow-x: auto; font-size: 12px;">${this.getEquation(fn.id)}</pre>
      </div>

      <div style="margin-bottom: 12px;">
        <strong>Global Minima (${minima.length}):</strong>
        ${minima.map((m, i) => `
          <div style="margin: 4px 0; padding: 8px; background: rgba(0,255,136,0.1); border-radius: 4px; border-left: 3px solid #00ff88;">
            #${i + 1}: (${m.x1.toFixed(6)}, ${m.x2.toFixed(6)}) = ${m.value.toFixed(6)}
          </div>
        `).join('')}
      </div>

      ${localMinima.length > 0 ? `
      <div style="margin-bottom: 12px;">
        <strong>Local Minima (${localMinima.length}):</strong>
        ${localMinima.slice(0, 10).map((m, i) => `
          <div style="margin: 2px 0; padding: 4px 8px; background: rgba(255,170,0,0.1); border-radius: 4px; border-left: 2px solid #ffaa00; font-size: 12px;">
            (${m.x1.toFixed(4)}, ${m.x2.toFixed(4)}) = ${m.value.toFixed(4)}
          </div>
        `).join('')}
        ${localMinima.length > 10 ? `<div style="color: #888; font-size: 11px;">... and ${localMinima.length - 10} more</div>` : ''}
      </div>
      ` : ''}

      <div style="border-top: 1px solid #334; padding-top: 12px;">
        <strong>Gradient:</strong> ${fn.gradient ? 'Analytical' : 'Numerical'}<br>
        <strong>Hessian:</strong> ${fn.hessian ? 'Analytical' : 'Numerical'}
      </div>
    `;
  }

  private getEquation(id: string): string {
    const equations: Record<string, string> = {
      sphere: 'f(x₁,x₂) = x₁² + x₂²',
      ellipsoid: 'f(x₁,x₂) = x₁² + 100·x₂²',
      rastrigin: 'f(x₁,x₂) = 20 + x₁² - 10cos(2πx₁) + x₂² - 10cos(2πx₂)',
      ackley: 'f(x₁,x₂) = -20exp(-0.2√(0.5(x₁²+x₂²))) - exp(0.5(cos(2πx₁)+cos(2πx₂))) + 20 + e',
      rosenbrock: 'f(x₁,x₂) = (1-x₁)² + 100(x₂-x₁²)²',
      himmelblau: 'f(x₁,x₂) = (x₁²+x₂-11)² + (x₁+x₂²-7)²',
      griewank: 'f(x₁,x₂) = (x₁²+x₂²)/4000 - cos(x₁)cos(x₂/√2) + 1',
      schwefel: 'f(x₁,x₂) = 837.9658 - x₁sin(√|x₁|) - x₂sin(√|x₂|)',
      booth: 'f(x₁,x₂) = (x₁+2x₂-7)² + (2x₁+x₂-5)²',
      beale: 'f(x₁,x₂) = (1.5-x₁+x₁x₂)² + (2.25-x₁+x₁x₂²)² + (2.625-x₁+x₁x₂³)²',
      matyas: 'f(x₁,x₂) = 0.26(x₁²+x₂²) - 0.48x₁x₂',
      easom: 'f(x₁,x₂) = -cos(x₁)cos(x₂)exp(-(x₁-π)²-(x₂-π)²)',
      'three-hump-camel': 'f(x₁,x₂) = 2x₁² - 1.05x₁⁴ + x₁⁶/6 + x₁x₂ + x₂²',
      'six-hump-camel': 'f(x₁,x₂) = (4-2.1x₁²+x₁⁴/3)x₁² + x₁x₂ + (-4+4x₂²)x₂²',
    };
    return equations[id] || 'f(x₁,x₂) = ...';
  }

  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
  }

  dispose(): void {
    this.container.remove();
  }
}