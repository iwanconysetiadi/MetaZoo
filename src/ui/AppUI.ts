import { installUISystem, icon, buttonContent, registerDialog, brandLockup, anchorPanel } from './UISystem';
import { OptimizationWorld } from '../core/world/OptimizationWorld';
import {
  WorldConfiguration, ViewMode, NormalizationMode, ProbeData,
  RESOLUTION_LEVELS, CriticalPoint,
} from '../core/math/Types';
import { globalRegistry } from '../core/math/CostFunction';
import { computeCrossSection, CrossSectionProfile, CrossSectionMode } from '../core/analysis/CrossSection';
import { listCustomFunctions, listChallenges, SavedCustomFunction } from '../core/custom/store';
import { ChallengeDefinition } from '../core/custom/ChallengeObjective';

export type OverlayToggleKey =
  | 'contours'
  | 'basins'
  | 'basinBoundaries'
  | 'gradientField'
  | 'curvature'
  | 'localMinima'
  | 'localMaxima'
  | 'saddlePoints';

export interface AppUICallbacks {
  onFunctionChange: (id: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onOverlayToggle: (key: OverlayToggleKey, value: boolean) => void;
  onContourCountChange: (count: number) => void;
  onVisualQualityChange: (quality: WorldConfiguration['visualQuality']) => void;
  onResolutionChange: (res: number) => void;
  onVerticalScaleChange: (scale: number) => void;
  onNormalizationChange: (mode: NormalizationMode) => void;
  onCameraPreset: (preset: string) => void;
  onResetCamera: () => void;
  onFocusOptimum: () => void;
  onAtmosphereChange: (mode: 'golden-hour' | 'twilight') => void;
  onPresentationToggle: (on: boolean) => void;
  onProbeEnabledChange: (on: boolean) => void;
  onCrossSectionChange: (profile: CrossSectionProfile | null) => void;
  onCreateWorld: () => void;
  onMakeChallenge: () => void;
  onEditWorld: () => void;
  onLoadSavedFunction: (saved: SavedCustomFunction) => void;
  onLoadChallenge: (challenge: ChallengeDefinition) => void;
}

interface Story {
  subtitle: string;
  equation: string;
}

const STORIES: Record<string, Story> = {
  sphere: { subtitle: 'The Convex Sanctuary', equation: 'f(x₁, x₂) = x₁² + x₂²' },
  ellipsoid: { subtitle: 'The Stretched Bowl', equation: 'f(x₁, x₂) = x₁² + 2x₂²' },
  booth: { subtitle: 'The Sloping Basin', equation: 'f = (x₁ + 2x₂ − 7)² + (2x₁ + x₂ − 5)²' },
  rastrigin: { subtitle: 'The Valley of Traps', equation: 'f = 20 + Σ [ xᵢ² − 10·cos(2π·xᵢ) ]' },
  ackley: { subtitle: 'The Hollow Basin', equation: 'f = −20·e^(−0.2√(½Σxᵢ²)) − e^(½Σcos(2πxᵢ)) + 20 + e' },
  rosenbrock: { subtitle: 'The Serpent Canyon', equation: 'f = (1 − x₁)² + 100·(x₂ − x₁²)²' },
  himmelblau: { subtitle: 'The Four Sanctuaries', equation: 'f = (x₁² + x₂ − 11)² + (x₁ + x₂² − 7)²' },
  griewank: { subtitle: 'The Rippled Bowl', equation: 'f = 1 + Σxᵢ²/4000 − Π cos(xᵢ/√i)' },
  schwefel: { subtitle: 'The Deceptive Peaks', equation: 'f = 418.9829·n − Σ xᵢ·sin(√|xᵢ|)' },
  beale: { subtitle: 'The Steep Valleys', equation: 'f = Σ (cᵢ − x₁ + x₁·x₂ⁱ)²' },
  matyas: { subtitle: 'The Gentle Saddle', equation: 'f = 0.26·(x₁² + x₂²) − 0.48·x₁·x₂' },
  easom: { subtitle: 'The Lone Basin', equation: 'f = −cos(x₁)·cos(x₂)·e^(−(x₁−π)²−(x₂−π)²)' },
  'three-hump-camel': { subtitle: 'The Three Valleys', equation: 'f = 2x₁² − 1.05x₁⁴ + x₁⁶/6 + x₁x₂ + x₂²' },
  'six-hump-camel': { subtitle: 'The Six Valleys', equation: 'f = (4 − 2.1x₁² + x₁⁴/3)x₁² + x₁x₂ + (−4 + 4x₂²)x₂²' },
};

type ToolName = 'probe' | 'camera' | 'layers' | 'analysis' | 'optimum' | 'settings';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export class AppUI {
  private world: OptimizationWorld;
  private callbacks: AppUICallbacks;

  private topBar!: HTMLElement;
  private dock!: HTMLElement;
  private panelHost!: HTMLElement;
  private telemetry!: HTMLElement;
  private probeCard!: HTMLElement;
  private worldModal!: HTMLElement;
  private fnDrawer!: HTMLElement;
  private present!: HTMLElement;
  private hint!: HTMLElement;

  private fnNameEl!: HTMLElement;
  private fnStoryEl!: HTMLElement;
  private fnClassEl!: HTMLElement;
  private viewButtons!: Map<ViewMode, HTMLButtonElement>;
  private dockButtons!: Map<ToolName, HTMLButtonElement>;

  private telX1!: HTMLElement;
  private telX2!: HTMLElement;
  private telF!: HTMLElement;
  private telG!: HTMLElement;
  private telBasin!: HTMLElement;
  private telOpt!: HTMLElement;

  private pcX1!: HTMLElement;
  private pcX2!: HTMLElement;
  private pcF!: HTMLElement;
  private pcG!: HTMLElement;
  private pcSlope!: HTMLElement;
  private pcCurvature!: HTMLElement;
  private pcBasin!: HTMLElement;

  private activeTool: ToolName | null = null;
  private probeEnabled = false;
  private pinnedProbeData: ProbeData[] = [];
  private releasePanelAnchor?: () => void;
  private presentation = false;
  private atmosphereMode: 'golden-hour' | 'twilight' = 'golden-hour';
  private atmosphereButton!: HTMLButtonElement;
  private atmosphereLabel!: HTMLElement;
  private mouseX = 0;
  private mouseY = 0;

  // Cross-section state
  private crossEnabled = false;
  private crossMode: CrossSectionMode = 'x1';
  private crossPosition = 0.5;
  private crossCanvas: HTMLCanvasElement | null = null;
  private crossProfile: CrossSectionProfile | null = null;
  private crossHoverT: number | null = null;

  constructor(world: OptimizationWorld, callbacks: AppUICallbacks) {
    this.world = world;
    this.callbacks = callbacks;
    this.viewButtons = new Map();
    this.dockButtons = new Map();

    installUISystem();
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented && this.activeTool) { const trigger = this.activeTool === 'settings' ? this.topBar.querySelector<HTMLElement>('[aria-label=Settings]') : this.dockButtons.get(this.activeTool); this.closeTool(); trigger?.focus(); } });
    document.addEventListener('metazoo:panel-open', e => { const source = (e as CustomEvent).detail; if (source !== 'tool') this.closeTool(); if (source !== 'atlas') this.closeWorldModal(); if (source !== 'info') this.closeFunctionDrawer(); });
    this.buildTopBar();
    this.buildDock();
    this.buildPanelHost();
    this.buildTelemetry();
    this.buildProbeCard();
    this.buildWorldModal();
    this.buildFunctionDrawer();
    this.buildPresent();
    this.buildHint();

    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.probeCard.classList.contains('show')) this.positionProbeCard();
    });

    this.syncFromConfig();
    this.updateFunctionInfo();
    this.scheduleOnboarding();
    this.callbacks.onProbeEnabledChange(this.probeEnabled);
  }

  // ============================================================= TOP BAR
  private buildTopBar(): void {
    this.topBar = el('div');
    this.topBar.id = 'ui-top'; this.topBar.setAttribute('aria-label', 'World navigation');

    const brand = brandLockup();
    const identity = el('div', 'world-identity'); identity.append(brand);
    this.topBar.append(identity);

    const title = el('button', 'fn-title');
    title.setAttribute('aria-label', 'Open Sky Atlas');
    const nameRow = el('div');
    this.fnNameEl = el('span', 'name', '—');
    const chev = el('span', 'chev'); chev.append(icon('chevron'));
    nameRow.appendChild(this.fnNameEl);
    nameRow.appendChild(chev);
    nameRow.style.display = 'flex';
    nameRow.style.alignItems = 'center';
    this.fnStoryEl = el('div', 'story', '');
    this.fnClassEl = el('div', 'fn-class', '');
    title.appendChild(nameRow);
    title.appendChild(this.fnStoryEl);
    this.fnClassEl.hidden = true; // Classification is displayed in Function Profile.
    title.title = 'Open Sky Atlas';
    title.addEventListener('click', () => this.openWorldModal());
    identity.append(title);

    const right = el('div', 'top-right');

    const atlasBtn = el('button', 'btn', 'World Atlas');
    buttonContent(atlasBtn, 'atlas', 'World Atlas');
    atlasBtn.style.padding = '7px 12px';
    atlasBtn.addEventListener('click', () => this.openWorldModal());
    right.appendChild(atlasBtn);

    const seg = el('div', 'seg');
    for (const mode of ['natural', 'scientific', 'topographic'] as ViewMode[]) {
      const btn = el('button', '', mode.charAt(0).toUpperCase() + mode.slice(1));
      btn.dataset.mode = mode;
      btn.addEventListener('click', () => this.setViewMode(mode));
      seg.appendChild(btn);
      this.viewButtons.set(mode, btn);
    }
    right.appendChild(seg);

    right.appendChild(this.iconButton('ⓘ', 'Function details', () => this.openFunctionDrawer()));
    this.atmosphereButton = el('button', 'atmosphere-toggle');
    this.atmosphereButton.type = 'button';
    const atmosphereIcon = el('span', 'atmosphere-icon'); atmosphereIcon.append(icon('sun')); this.atmosphereButton.append(atmosphereIcon);
    this.atmosphereLabel = el('span', 'atmosphere-label', 'Golden Hour');
    this.atmosphereButton.appendChild(this.atmosphereLabel);
    this.atmosphereButton.setAttribute('aria-pressed', 'false');
    this.atmosphereButton.title = 'Switch between Golden Hour and Twilight';
    this.atmosphereButton.addEventListener('click', () => {
      this.atmosphereMode = this.atmosphereMode === 'golden-hour' ? 'twilight' : 'golden-hour';
      const twilight = this.atmosphereMode === 'twilight';
      this.atmosphereButton.querySelector('.atmosphere-icon')!.replaceChildren(icon(twilight ? 'moon' : 'sun'));
      this.atmosphereLabel.textContent = twilight ? 'Twilight' : 'Golden Hour';
      this.atmosphereButton.setAttribute('aria-pressed', String(twilight));
      this.callbacks.onAtmosphereChange(this.atmosphereMode);
    });
    right.appendChild(this.atmosphereButton);
    right.appendChild(this.iconButton('⚙', 'Settings', () => this.toggleTool('settings')));
    right.appendChild(this.iconButton('◱', 'Presentation mode', () => this.togglePresentation()));

    this.topBar.appendChild(right);
    document.body.appendChild(this.topBar);
  }

  private iconButton(_glyph: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', 'icon-btn');
    buttonContent(b, title === 'Settings' ? 'settings' : title === 'Presentation mode' ? 'present' : 'info');
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', onClick);
    return b;
  }

  // ============================================================= DOCK
  private buildDock(): void {
    this.dock = el('div');
    this.dock.id = 'ui-dock';

    const tools: Array<[ToolName, string, string]> = [
      ['probe', '◎', 'Probe'],
      ['camera', '⌖', 'Camera'],
      ['layers', '◫', 'Layers'],
      ['analysis', '∑', 'Analysis'],
      ['optimum', '✦', 'Optimum'],
    ];
    const groups = new Set<ToolName>(['layers', 'optimum']);

    for (const [name, , label] of tools) {
      if (groups.has(name)) this.dock.appendChild(el('div', 'dock-divider'));
      const b = el('button', 'dock-btn');
      b.appendChild(icon(name));
      b.appendChild(el('span', 'lbl', label));
      b.dataset.tool = name;
      b.addEventListener('click', () => this.toggleTool(name));
      this.dock.appendChild(b);
      this.dockButtons.set(name, b);
    }

    document.body.appendChild(this.dock);
  }

  private buildPanelHost(): void {
    this.panelHost = el('div');
    this.panelHost.id = 'ui-panel-host';
    document.body.appendChild(this.panelHost);
  }

  // ============================================================= TELEMETRY
  private buildTelemetry(): void {
    this.telemetry = el('div');
    this.telemetry.id = 'ui-telemetry';

    this.telX1 = this.metric(this.telemetry, 'x₁');
    this.telX2 = this.metric(this.telemetry, 'x₂');
    this.telF = this.metric(this.telemetry, 'f(x)');

    const gWrap = el('div', 'metric sci-only');
    gWrap.appendChild(el('span', 'k', '|∇f|'));
    this.telG = el('span', 'v', '—');
    gWrap.appendChild(this.telG);
    this.telemetry.appendChild(gWrap);

    const bWrap = el('div', 'metric sci-only');
    bWrap.appendChild(el('span', 'k', 'Basin'));
    this.telBasin = el('span', 'v', '—');
    bWrap.appendChild(this.telBasin);
    this.telemetry.appendChild(bWrap);

    this.telemetry.appendChild(el('div', 'divider'));

    const optWrap = el('div', 'metric');
    optWrap.appendChild(el('span', 'k', 'Global optimum'));
    this.telOpt = el('span', 'v opt', '—');
    optWrap.appendChild(this.telOpt);
    this.telemetry.appendChild(optWrap);

    const bottom = el('div'); bottom.id = 'ui-bottom';
    bottom.append(this.telemetry, this.dock); document.body.append(bottom);
  }

  private metric(parent: HTMLElement, key: string): HTMLElement {
    const wrap = el('div', 'metric');
    wrap.appendChild(el('span', 'k', key));
    const v = el('span', 'v', '—');
    wrap.appendChild(v);
    parent.appendChild(wrap);
    return v;
  }

  // ============================================================= PROBE CARD
  private buildProbeCard(): void {
    this.probeCard = el('div');
    this.probeCard.id = 'ui-probe-card';

    this.pcX1 = this.pcRow(this.probeCard, 'x₁');
    this.pcX2 = this.pcRow(this.probeCard, 'x₂');

    const sci = el('div', 'pc-sci');
    this.pcG = this.pcRow(sci, '|∇f|');
    this.pcSlope = this.pcRow(sci, 'slope');
    this.pcCurvature = this.pcRow(sci, 'curvature');
    this.pcBasin = this.pcRow(sci, 'basin');
    this.probeCard.appendChild(sci);

    this.pcF = el('div', 'pc-f', '—');
    this.probeCard.appendChild(this.pcF);

    document.body.appendChild(this.probeCard);
  }

  private pcRow(parent: HTMLElement, key: string): HTMLElement {
    const row = el('div', 'pc-row');
    row.appendChild(el('span', '', key));
    const b = el('b', '', '—');
    row.appendChild(b);
    parent.appendChild(row);
    return b;
  }

  private positionProbeCard(): void {
    const pad = 16;
    const rect = this.probeCard.getBoundingClientRect();
    let x = this.mouseX + pad;
    let y = this.mouseY + pad;
    if (x + rect.width > window.innerWidth - 8) x = this.mouseX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = this.mouseY - rect.height - pad;
    this.probeCard.style.left = `${Math.max(8, x)}px`;
    this.probeCard.style.top = `${Math.max(8, y)}px`;
  }

  // ============================================================= WORLD MODAL
  private contourPreview(def: ReturnType<typeof globalRegistry.getAllDefinitions>[number]): HTMLCanvasElement {
    const canvas = el('canvas', 'atlas-contour') as HTMLCanvasElement; canvas.width = 480; canvas.height = 180; canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d'); if (!ctx) return canvas;
    const n=40, values:number[]=[]; const d=def.domain;
    for(let y=0;y<=n;y++) for(let x=0;x<=n;x++) { const v=def.evaluate(d.x1Min+x/n*(d.x1Max-d.x1Min),d.x2Min+y/n*(d.x2Max-d.x2Min)); values.push(Number.isFinite(v)?v:0); }
    const sorted=[...values].sort((a,b)=>a-b); ctx.strokeStyle='rgba(154,196,180,.55)'; ctx.lineWidth=1;
    for(let k=1;k<10;k++) { const level=sorted[Math.floor(k/10*(sorted.length-1))]; ctx.beginPath();
      for(let y=0;y<n;y++)for(let x=0;x<n;x++) { const corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]]; const points:number[][]=[];
        for(let e=0;e<4;e++){const a=corners[e],b=corners[(e+1)%4],va=values[a[1]*(n+1)+a[0]],vb=values[b[1]*(n+1)+b[0]];if((va<level)!==(vb<level)){const t=(level-va)/(vb-va);points.push([(a[0]+t*(b[0]-a[0]))/n*480,(a[1]+t*(b[1]-a[1]))/n*180]);}}
        for(let i=0;i+1<points.length;i+=2){ctx.moveTo(...points[i] as [number,number]);ctx.lineTo(...points[i+1] as [number,number]);}
      } ctx.stroke();
    } return canvas;
  }

  private buildWorldModal(): void {
    this.worldModal = el('div');
    this.worldModal.id = 'ui-world-modal';
    this.worldModal.addEventListener('click', (e) => {
      if (e.target === this.worldModal) this.closeWorldModal();
    });

    const inner = el('div', 'world-modal-inner');
    inner.style.display = 'flex';
    inner.style.flexDirection = 'column';

    const headRow = el('div');
    headRow.style.display = 'flex';
    headRow.style.alignItems = 'center';
    headRow.style.justifyContent = 'space-between';
    const atlasTitle = el('div', 'atlas-heading');
    atlasTitle.appendChild(el('h2', '', 'Sky Atlas'));
    atlasTitle.appendChild(el('p', '', 'Choose a mathematical world to explore.'));
    headRow.appendChild(atlasTitle);

    const headButtons = el('div');
    headButtons.style.display = 'flex';
    headButtons.style.gap = '8px';
    const makeBtn = el('button', 'btn', '⚙ Make Challenge');
    makeBtn.addEventListener('click', () => { this.closeWorldModal(); this.callbacks.onMakeChallenge(); });
    const createBtn = el('button', 'btn primary', '＋ Create World');
    createBtn.addEventListener('click', () => { this.closeWorldModal(); this.callbacks.onCreateWorld(); });
    headButtons.appendChild(makeBtn);
    buttonContent(makeBtn, 'settings', 'Make Challenge'); buttonContent(createBtn, 'plus', 'Create World');
    headButtons.appendChild(createBtn);
    const closeAtlas = el('button', 'icon-btn'); buttonContent(closeAtlas, 'close'); closeAtlas.setAttribute('aria-label', 'Close Atlas'); closeAtlas.addEventListener('click', () => this.closeWorldModal()); headButtons.append(closeAtlas);
    headRow.appendChild(headButtons);
    inner.appendChild(headRow);

    const scroll = el('div');
    scroll.style.overflowY = 'auto';
    scroll.style.flex = '1';
    scroll.style.paddingRight = '4px';

    // Built-in worlds
    scroll.appendChild(el('div', 'group-label', 'Built-in Worlds'));
    const cards = el('div', 'world-cards');
    for (const def of globalRegistry.getAllDefinitions()) {
      const story = STORIES[def.id];
      const card = el('button', 'world-card');
      card.dataset.id = def.id;
      card.classList.add('realm-card');

      const art = el('div', 'realm-art');
      art.dataset.world = def.id;
      card.appendChild(art);

      const top = el('div', 'wc-top');
      const nameWrap = el('div');
      nameWrap.appendChild(el('div', 'realm-function', def.shortName || def.name));
      nameWrap.appendChild(el('div', 'realm-title', story?.subtitle ?? 'Optimization World'));
      top.appendChild(nameWrap);
      top.appendChild(el('span', 'wc-badge', def.functionClass));
      card.prepend(top);
      art.append(this.contourPreview(def));

      card.appendChild(el('div', 'wc-desc', def.metadata.description));

      const meta = el('div', 'wc-meta');
      const g = def.knownGlobalMinima[0];
      const optText = g ? `(${g.x1.toFixed(2)}, ${g.x2.toFixed(2)}) · f* ${g.value.toFixed(3)}` : '—';
      meta.innerHTML =
        `<div><b>Domain</b> [${def.domain.x1Min}, ${def.domain.x1Max}] × [${def.domain.x2Min}, ${def.domain.x2Max}]</div>` +
        `<div><b>Optimum</b> ${optText}</div>`;
      card.appendChild(meta);

      card.addEventListener('click', () => {
        this.closeWorldModal();
        this.callbacks.onFunctionChange(def.id);
      });
      cards.appendChild(card);
    }
    scroll.appendChild(cards);

    // My Worlds
    const savedFns = listCustomFunctions();
    if (savedFns.length > 0) {
      scroll.appendChild(el('div', 'group-label', 'My Worlds'));
      const list = el('div', 'world-cards');
      for (const saved of savedFns) {
        const card = el('button', 'world-card');
        card.classList.add('realm-card');
        const art = el('div', 'realm-art');
        art.dataset.world = 'custom';
        card.appendChild(art);
        const top = el('div', 'wc-top');
        const nameWrap = el('div');
        nameWrap.appendChild(el('div', 'wc-name', saved.name));
        nameWrap.appendChild(el('div', 'wc-sub', 'Custom World'));
        top.appendChild(nameWrap);
        top.appendChild(el('span', 'wc-badge', 'custom'));
        card.appendChild(top);
        const meta = el('div', 'wc-meta');
        const d = saved.definition.domain;
        meta.innerHTML = `<div><b>f</b> ${saved.definition.expression}</div><div><b>Domain</b> [${d.x1Min}, ${d.x1Max}]²</div>`;
        meta.style.wordBreak = 'break-word';
        card.appendChild(meta);
        card.addEventListener('click', () => { this.closeWorldModal(); this.callbacks.onLoadSavedFunction(saved); });
        list.appendChild(card);
      }
      scroll.appendChild(list);
    }

    const challenges = listChallenges();
    if (challenges.length > 0) {
      scroll.appendChild(el('div', 'group-label', 'Challenges'));
      const list = el('div', 'world-cards');
      for (const ch of challenges) {
        const card = el('button', 'world-card');
        card.classList.add('realm-card');
        const art = el('div', 'realm-art');
        art.dataset.world = 'challenge';
        card.appendChild(art);
        const top = el('div', 'wc-top');
        const nameWrap = el('div');
        nameWrap.appendChild(el('div', 'wc-name', ch.name));
        nameWrap.appendChild(el('div', 'wc-sub', 'Challenge'));
        top.appendChild(nameWrap);
        top.appendChild(el('span', 'wc-badge', 'challenge'));
        card.appendChild(top);
        const tags = ch.metadata.tags.join(' · ') || 'custom';
        card.appendChild(el('div', 'wc-desc', tags));
        card.addEventListener('click', () => { this.closeWorldModal(); this.callbacks.onLoadChallenge(ch); });
        list.appendChild(card);
      }
      scroll.appendChild(list);
    }

    const tabs = el('div', 'atlas-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'World collections');
    const sections: HTMLElement[][] = [[], [], []]; let section = -1;
    for (const child of Array.from(scroll.children) as HTMLElement[]) {
      if (child.classList.contains('group-label')) section = child.textContent === 'My Worlds' ? 1 : child.textContent === 'Challenges' ? 2 : 0;
      if (section >= 0) sections[section].push(child);
    }
    for (let i=1; i<3; i++) if (!sections[i].length) {
      const empty = el('div', 'atlas-empty', i === 1 ? 'Your saved worlds will appear here. Create a world to begin.' : 'Your saved challenges will appear here. Make a challenge to begin.'); scroll.append(empty); sections[i].push(empty);
    }
    const activate = (index: number) => { sections.forEach((group, i) => group.forEach(node => node.hidden = i !== index)); Array.from(tabs.children).forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); (tab as HTMLElement).tabIndex = i === index ? 0 : -1; }); };
    ['Built-In', 'My Worlds', 'Challenges'].forEach((name, index) => {
      const tab = el('button', '', name); tab.setAttribute('role', 'tab'); tab.addEventListener('click', () => activate(index));
      tab.addEventListener('keydown', event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3; activate(next); (tabs.children[next] as HTMLElement).focus(); } }); tabs.append(tab);
    });
    activate(0); inner.append(tabs);
    inner.appendChild(scroll);
    this.worldModal.appendChild(inner);
    document.body.appendChild(this.worldModal);
    this.worldModal.setAttribute('aria-label', 'Sky Atlas'); registerDialog(this.worldModal, () => this.closeWorldModal());
  }

  openWorldModal(): void {
    document.dispatchEvent(new CustomEvent('metazoo:panel-open', { detail: 'atlas' }));
    this.worldModal.remove(); this.buildWorldModal();
    this.closeFunctionDrawer();
    this.worldModal.classList.add('open');
    this.highlightActiveWorld();
  }

  closeWorldModal(): void {
    this.worldModal.classList.remove('open');
  }

  private highlightActiveWorld(): void {
    const active = this.world.getConfig().functionId;
    this.worldModal.querySelectorAll<HTMLElement>('.world-card').forEach(card => {
      card.classList.toggle('active', card.dataset.id === active); card.setAttribute('aria-pressed', String(card.dataset.id === active));
    });
  }

  // ============================================================= FUNCTION DRAWER
  private buildFunctionDrawer(): void {
    this.fnDrawer = el('div');
    this.fnDrawer.id = 'ui-fn-drawer';
    document.body.appendChild(this.fnDrawer);
    this.fnDrawer.setAttribute('aria-label', 'Function profile'); registerDialog(this.fnDrawer, () => this.closeFunctionDrawer());
  }

  openFunctionDrawer(): void {
    document.dispatchEvent(new CustomEvent('metazoo:panel-open', { detail: 'info' }));
    const def = this.world.getFunction().definition;
    const story = STORIES[def.id];
    const g = def.knownGlobalMinima[0];

    this.fnDrawer.innerHTML = '';

    const head = el('div', 'drawer-head');
    head.appendChild(el('div', '', 'Function Profile'));
    const close = el('button', 'icon-btn', '✕');
    close.addEventListener('click', () => this.closeFunctionDrawer());
    head.appendChild(close);
    this.fnDrawer.appendChild(head);

    const body = el('div', 'drawer-body');
    body.appendChild(el('h3', '', def.name));
    body.appendChild(el('div', 'cls', `${story?.subtitle ?? 'Landscape'} · ${def.functionClass}`));
    body.appendChild(el('div', 'eq', story?.equation ?? 'f(x₁, x₂)'));

    const kv = (k: string, v: string) => {
      const row = el('div', 'kv');
      row.appendChild(el('span', 'k', k));
      row.appendChild(el('span', 'v', v));
      body.appendChild(row);
    };
    kv('Classification', def.functionClass);
    kv('Difficulty', def.metadata.difficulty);
    kv('Domain', `[${def.domain.x1Min}, ${def.domain.x1Max}] × [${def.domain.x2Min}, ${def.domain.x2Max}]`);
    if (g) {
      kv('Global optimum', `(${g.x1}, ${g.x2})`);
      kv('f*', String(g.value));
    }

    body.appendChild(el('p', '', def.metadata.description));
    body.appendChild(el('p', '', def.metadata.topologyNotes));

    this.fnDrawer.appendChild(body);
    this.closeWorldModal();
    this.fnDrawer.classList.add('open');
  }

  closeFunctionDrawer(): void {
    this.fnDrawer.classList.remove('open');
  }

  // ============================================================= PRESENTATION
  private buildPresent(): void {
    this.present = el('div');
    this.present.id = 'ui-present';
    this.present.innerHTML = `
      <div class="p-brand">METAZOO</div>
      <div class="p-meta"><b id="p-name">—</b> · <span id="p-view">Natural View</span></div>
      <div class="p-opt">Global optimum <b id="p-opt">—</b></div>`;
    this.present.querySelector('.p-brand')?.replaceChildren(brandLockup());
    document.body.appendChild(this.present);
  }

  showCrossSection(): void {
    this.crossEnabled = true;
    this.openTool('analysis');
  }

  togglePresentation(): void {
    this.presentation = !this.presentation;
    document.body.classList.toggle('presentation-mode', this.presentation);
    this.callbacks.onPresentationToggle(this.presentation);
    this.updatePresentMeta();
  }

  setPresentation(on: boolean): void {
    this.presentation = on;
    document.body.classList.toggle('presentation-mode', on);
    this.updatePresentMeta();
  }

  private updatePresentMeta(): void {
    const def = this.world.getFunction().definition;
    const g = def.knownGlobalMinima[0];
    const view = this.world.getConfig().viewMode;
    const nameEl = document.getElementById('p-name');
    const viewEl = document.getElementById('p-view');
    const optEl = document.getElementById('p-opt');
    if (nameEl) nameEl.textContent = def.shortName || def.name;
    if (viewEl) viewEl.textContent = view.charAt(0).toUpperCase() + view.slice(1) + ' View';
    if (optEl) optEl.textContent = g ? `(${g.x1.toFixed(3)}, ${g.x2.toFixed(3)}) · f*=${g.value.toFixed(4)}` : '—';
  }

  // ============================================================= HINT
  private buildHint(): void {
    this.hint = el('div');
    this.hint.id = 'ui-hint';
    this.hint.innerHTML = '<span>Drag to orbit · hover the terrain to inspect · press <b>2</b> for Scientific</span>';
    const close = el('button', '', '✕');
    close.addEventListener('click', () => this.hint.classList.remove('show'));
    this.hint.appendChild(close);
    document.body.appendChild(this.hint);
  }

  private scheduleOnboarding(): void {
    window.setTimeout(() => this.hint.classList.add('show'), 900);
    window.setTimeout(() => this.hint.classList.remove('show'), 9000);
  }

  // ============================================================= TOOLS / PANELS
  toggleTool(name: ToolName): void {
    if (this.activeTool === name) {
      this.closeTool();
    } else {
      this.openTool(name);
    }
  }

  private openTool(name: ToolName): void {
    document.dispatchEvent(new CustomEvent('metazoo:panel-open', { detail: 'tool' }));
    this.closeWorldModal(); this.closeFunctionDrawer();
    if (name === 'probe') this.setProbeEnabled(true);
    else if (this.activeTool === 'probe') this.setProbeEnabled(false);
    this.activeTool = name;
    this.panelHost.innerHTML = '';

    let panel: HTMLElement;
    switch (name) {
      case 'probe': panel = this.renderProbePanel(); break;
      case 'camera': panel = this.renderCameraPanel(); break;
      case 'layers': panel = this.renderLayersPanel(); break;
      case 'analysis': panel = this.renderAnalysisPanel(); break;
      case 'optimum': panel = this.renderOptimumPanel(); break;
      case 'settings': panel = this.renderSettingsPanel(); break;
      default: panel = this.panel('');
    }

    this.panelHost.appendChild(panel);
    if (name === 'probe') this.renderPinnedProbes();
    this.panelHost.classList.add('open');
    this.updateDockState();
    this.releasePanelAnchor?.();
    const trigger = name === 'settings' ? this.topBar.querySelector<HTMLElement>('[aria-label=Settings]') : this.dockButtons.get(name);
    if (trigger) this.releasePanelAnchor = anchorPanel(this.panelHost, trigger);
  }

  closeTool(): void {
    const trigger = this.activeTool === 'settings' ? this.topBar.querySelector<HTMLElement>('[aria-label=Settings]') : this.activeTool ? this.dockButtons.get(this.activeTool) : null;
    const restoreFocus = this.panelHost.contains(document.activeElement);
    this.releasePanelAnchor?.(); this.releasePanelAnchor = undefined;
    if (this.activeTool === 'probe') this.setProbeEnabled(false);
    this.activeTool = null;
    this.panelHost.classList.remove('open');
    this.panelHost.innerHTML = '';
    this.updateDockState();
    if (restoreFocus) trigger?.focus();
  }

  private updateDockState(): void {
    for (const [name, btn] of this.dockButtons) {
      btn.classList.toggle('active', name === this.activeTool);
      btn.setAttribute('aria-expanded', String(name === this.activeTool));
    }
  }

  private panel(title: string): HTMLElement {
    const p = el('div', 'tool-panel');
    const header = el('h4', '', title);
    const close = el('button', 'icon-btn'); buttonContent(close, 'close'); close.setAttribute('aria-label', 'Close panel');
    close.addEventListener('click', () => this.closeTool()); header.append(close); p.append(header);
    return p;
  }

  private makeSwitch(on: boolean, onChange: (v: boolean) => void): HTMLElement {
    const s = el('button', 'switch' + (on ? ' on' : ''));
    s.setAttribute('role', 'switch');
    s.setAttribute('aria-checked', String(on));
    s.addEventListener('click', () => {
      const v = !s.classList.contains('on');
      s.classList.toggle('on', v);
      s.setAttribute('aria-checked', String(v));
      onChange(v);
    });
    return s;
  }

  private switchRow(parent: HTMLElement, label: string, on: boolean, onChange: (v: boolean) => void): void {
    const row = el('div', 'row');
    row.appendChild(el('span', 'grow', label));
    const control = this.makeSwitch(on, onChange); control.setAttribute('aria-label', label); row.appendChild(control);
    parent.appendChild(row);
  }

  getProbeEnabled(): boolean { return this.probeEnabled; }

  private setProbeEnabled(enabled: boolean): void {
    this.probeEnabled = enabled; this.callbacks.onProbeEnabledChange(enabled);
    if (!enabled) this.setProbe(null);
  }

  addPinnedProbe(data: ProbeData): void {
    this.pinnedProbeData = [...this.pinnedProbeData.slice(-2), { ...data }];
    this.renderPinnedProbes();
  }

  private renderPinnedProbes(): void {
    const list = this.panelHost.querySelector<HTMLElement>('.probe-pins'); if (!list) return;
    list.replaceChildren(el('div', 'group-label', 'Pinned readings'));
    if (!this.pinnedProbeData.length) { list.append(el('p', 'ui-help', 'Click the terrain to keep a reading here.')); return; }
    for (const data of [...this.pinnedProbeData].reverse()) {
      const reading = el('div', 'probe-reading');
      for (const [key, value] of [['x\u2081', data.x1.toFixed(4)], ['x\u2082', data.x2.toFixed(4)], ['f', data.cost.toFixed(4)]]) {
        const field = el('div'); field.append(el('span', 'k', key), el('b', 'v', value)); reading.append(field);
      } list.append(reading);
    }
  }

  private renderProbePanel(): HTMLElement {
    const p = this.panel('Probe');
    const body = el('div', 'pbody');
    this.switchRow(body, 'Enable terrain probe', this.probeEnabled, (v) => {
      this.setProbeEnabled(v);
    });
    const hint = el('div', 'row');
    hint.style.color = 'var(--muted)';
    hint.style.fontSize = '11px';
    hint.style.lineHeight = '1.5';
    hint.textContent = 'Hover the world to read objective values. Click to pin a probe.';
    body.appendChild(hint);
    body.append(el('div', 'probe-pins'));
    p.appendChild(body);
    return p;
  }

  private renderCameraPanel(): HTMLElement {
    const p = this.panel('Camera'); const body = el('div', 'pbody camera-controls');
    const cinematic = this.cameraButton('cinematic', 'Cinematic survey'); cinematic.classList.add('btn', 'primary', 'camera-cinematic'); buttonContent(cinematic, 'camera', 'Cinematic survey'); body.append(cinematic);
    body.append(el('div', 'group-label', 'Viewpoint'));
    const primary = el('div', 'seg camera-viewpoints'); primary.setAttribute('role', 'group'); primary.setAttribute('aria-label', 'Camera viewpoint');
    for (const [id, label] of [['overview', 'Overview'], ['orbit', 'Orbit'], ['top-down', 'Top']]) primary.append(this.cameraButton(id, label));
    body.append(primary);
    const focus = this.cameraButton('minimum-focus', 'Focus optimum'); focus.classList.add('btn', 'ghost', 'camera-focus'); buttonContent(focus, 'optimum', 'Focus optimum'); body.append(focus);
    const advanced = el('details', 'ui-disclosure camera-advanced'); advanced.append(el('summary', '', 'More camera views'));
    const options = el('div', 'camera-options');
    for (const [id, label] of [['valley-view', 'Valley'], ['underside', 'Island underside'], ['cross-section', 'Cross section']]) options.append(this.cameraButton(id, label));
    advanced.append(options); body.append(advanced);
    const reset = el('button', 'btn ghost camera-reset'); buttonContent(reset, 'reset', 'Reset camera'); reset.addEventListener('click', () => this.callbacks.onResetCamera()); body.append(reset);
    p.append(body); return p;
  }

  private cameraButton(id: string, label: string): HTMLButtonElement {
    const selected = this.world.getConfig().cameraPreset === id;
    const b = el('button', 'camera-preset' + (selected ? ' active' : ''), label); b.dataset.preset = id; b.setAttribute('aria-pressed', String(selected));
    b.addEventListener('click', () => {
      this.panelHost.querySelectorAll<HTMLElement>('[data-preset]').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('active'); b.setAttribute('aria-pressed', 'true'); this.callbacks.onCameraPreset(id);
    }); return b;
  }

  private renderLayersPanel(): HTMLElement {
    const p = this.panel('Layers');
    const body = el('div', 'pbody');
    const ov = this.world.getConfig().overlays;
    const cfg = this.world.getConfig();

    this.switchRow(body, 'Contours', ov.contours, (v) => {
      this.callbacks.onOverlayToggle('contours', v);
      this.refreshOpenTool();
    });

    if (ov.contours) {
      const row = el('div', 'row');
      row.appendChild(el('span', 'grow', 'Contour levels'));
      const val = el('span', 'mono', String(cfg.contourCount));
      row.appendChild(val);
      body.appendChild(row);
      const slider = el('input') as HTMLInputElement;
      slider.type = 'range';
      slider.min = '4'; slider.max = '28'; slider.step = '1';
      slider.value = String(cfg.contourCount);
      slider.style.margin = '0 8px 6px';
      slider.style.width = 'calc(100% - 16px)';
      slider.addEventListener('input', () => {
        val.textContent = slider.value;
        this.callbacks.onContourCountChange(parseInt(slider.value, 10));
      });
      body.appendChild(slider);
    }

    this.switchRow(body, 'Attraction basins', ov.basins, (v) => this.callbacks.onOverlayToggle('basins', v));
    this.switchRow(body, 'Basin boundaries', ov.basinBoundaries, (v) => this.callbacks.onOverlayToggle('basinBoundaries', v));
    this.switchRow(body, 'Gradient field', ov.gradientField, (v) => this.callbacks.onOverlayToggle('gradientField', v));
    this.switchRow(body, 'Curvature', ov.curvature, (v) => this.callbacks.onOverlayToggle('curvature', v));

    p.appendChild(body);
    return p;
  }

  private renderAnalysisPanel(): HTMLElement {
    const p = this.panel('Analysis');
    const body = el('div', 'pbody');
    const cp = this.world.getConfig().overlays.criticalPoints;

    body.appendChild(el('div', 'group-label', 'Critical Points'));
    const reference = el('div', 'row analysis-reference');
    reference.appendChild(el('span', 'grow', 'Global minimum'));
    reference.appendChild(el('span', 'reference-state', 'Always shown'));
    body.appendChild(reference);
    this.switchRow(body, 'Local minima', cp.localMinima, (v) => this.callbacks.onOverlayToggle('localMinima', v));
    this.switchRow(body, 'Local maxima', cp.localMaxima, (v) => this.callbacks.onOverlayToggle('localMaxima', v));
    this.switchRow(body, 'Saddle points', cp.saddlePoints, (v) => this.callbacks.onOverlayToggle('saddlePoints', v));

    const legend = el('div', 'analysis-legend');
    legend.innerHTML =
      '<span><b style="color:var(--accent)">◎</b> Global</span>' +
      '<span><b style="color:var(--gold)">▽</b> Local min</span>' +
      '<span><b style="color:var(--red)">△</b> Local max</span>' +
      '<span><b style="color:var(--violet)">◇</b> Saddle</span>';
    body.appendChild(legend);

    body.appendChild(el('div', 'group-label', 'Cross Section'));
    this.switchRow(body, 'Enable cross section', this.crossEnabled, (v) => {
      this.crossEnabled = v;
      this.openTool('analysis');
    });

    if (this.crossEnabled) {
      const seg = el('div', 'seg');
      seg.style.margin = '2px 8px 6px';
      const modes: Array<[CrossSectionMode, string]> = [['x1', 'X₁'], ['x2', 'X₂'], ['custom', 'Custom']];
      for (const [mode, label] of modes) {
        const b = el('button', '', label);
        if (this.crossMode === mode) b.classList.add('active');
        b.addEventListener('click', () => { this.crossMode = mode; this.openTool('analysis'); });
        seg.appendChild(b);
      }
      body.appendChild(seg);

      const row = el('div', 'row');
      row.appendChild(el('span', 'grow', 'Position'));
      const val = el('span', 'mono', this.crossProfile?.fixedLabel ?? '');
      row.appendChild(val);
      body.appendChild(row);

      const slider = el('input') as HTMLInputElement;
      slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.01';
      slider.value = String(this.crossPosition);
      slider.style.margin = '0 8px 8px'; slider.style.width = 'calc(100% - 16px)';
      slider.addEventListener('input', () => {
        this.crossPosition = parseFloat(slider.value);
        this.refreshCrossSection();
        const label = this.crossProfile?.fixedLabel ?? '';
        val.textContent = label;
      });
      body.appendChild(slider);

      const canvas = document.createElement('canvas');
      canvas.width = 680; canvas.height = 300;
      canvas.style.width = 'calc(100% - 16px)';
      canvas.style.height = '150px';
      canvas.style.margin = '0 8px 6px';
      canvas.style.borderRadius = '8px';
    canvas.style.background = 'rgba(23,59,60,0.025)';
      canvas.style.cursor = 'crosshair';
      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const W = canvas.width;
        const padL = 44, padR = 12;
        const mx = ((e.clientX - rect.left) / rect.width) * W;
        const t = Math.max(0, Math.min(1, (mx - padL) / (W - padL - padR)));
        this.crossHoverT = t;
        this.drawCrossGraph();
      });
      canvas.addEventListener('mouseleave', () => {
        this.crossHoverT = null;
        this.drawCrossGraph();
      });
      this.crossCanvas = canvas;
      body.appendChild(canvas);

      this.refreshCrossSection();
    } else {
      this.crossCanvas = null;
      this.callbacks.onCrossSectionChange(null);
    }

    p.appendChild(body);
    return p;
  }

  private refreshCrossSection(): void {
    if (!this.crossEnabled) {
      this.crossProfile = null;
      this.callbacks.onCrossSectionChange(null);
      return;
    }
    this.crossProfile = computeCrossSection(this.world, this.crossMode, this.crossPosition, 150);
    this.callbacks.onCrossSectionChange(this.crossProfile);
    if (this.crossCanvas) this.drawCrossGraph();
  }

  private drawCrossGraph(): void {
    const canvas = this.crossCanvas;
    const profile = this.crossProfile;
    if (!canvas || !profile) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const padL = 44, padR = 12, padT = 14, padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const { samples, minF, maxF } = profile;
    const range = (maxF - minF) || 1;
    const xOf = (t: number) => padL + t * plotW;
    const yOf = (f: number) => padT + (1 - (f - minF) / range) * plotH;

    // gridlines
    ctx.strokeStyle = 'rgba(16,32,90,0.09)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const y = padT + (g / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
    }

    // filled area + curve
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, 'rgba(40,125,120,0.24)');
    grad.addColorStop(1, 'rgba(40,125,120,0.015)');
    ctx.beginPath();
    ctx.moveTo(xOf(samples[0].t), yOf(samples[0].f));
    for (const s of samples) ctx.lineTo(xOf(s.t), yOf(s.f));
    ctx.lineTo(xOf(1), padT + plotH);
    ctx.lineTo(xOf(0), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(xOf(samples[0].t), yOf(samples[0].f));
    for (const s of samples) ctx.lineTo(xOf(s.t), yOf(s.f));
    ctx.strokeStyle = '#287d78';
    ctx.lineWidth = 2;
    ctx.stroke();

    // local minima along the profile (gold), global minimum (accent, larger)
    for (let i = 1; i < samples.length - 1; i++) {
      const a = samples[i - 1].f, b = samples[i].f, c = samples[i + 1].f;
      if (b <= a && b <= c && (a - b) + (c - b) > 1e-4) {
        ctx.beginPath();
        ctx.arc(xOf(samples[i].t), yOf(b), 3, 0, Math.PI * 2);
        ctx.fillStyle = '#e6a23c';
        ctx.fill();
      }
    }
    const mn = samples[profile.minIndex];
    ctx.beginPath();
    ctx.arc(xOf(mn.t), yOf(mn.f), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#287d78';
    ctx.fill();

    // axis labels
    ctx.fillStyle = 'rgba(83,101,141,0.9)';
    ctx.font = '600 15px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(maxF.toFixed(2), padL - 8, padT + 6);
    ctx.fillText(minF.toFixed(2), padL - 8, padT + plotH - 6);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(83,101,141,0.85)';
    ctx.font = '600 14px "JetBrains Mono", monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(profile.startLabel, padL, H - 8);
    ctx.textAlign = 'right';
    ctx.fillText(profile.endLabel, padL + plotW, H - 8);
    ctx.textAlign = 'center';
    ctx.fillText(profile.axisLabel, padL + plotW / 2, H - 8);

    // hover crosshair + value
    if (this.crossHoverT != null) {
      const idx = Math.round(this.crossHoverT * (samples.length - 1));
      const s = samples[idx];
      const hx = xOf(s.t), hy = yOf(s.f);
      ctx.strokeStyle = 'rgba(39,124,152,0.72)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + plotH); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#277c98'; ctx.fill();

      const label = `f ${s.f.toFixed(3)}`;
      ctx.font = '600 14px "JetBrains Mono", monospace';
      const tw = ctx.measureText(label).width + 14;
      let tx = hx + 8; if (tx + tw > padL + plotW) tx = hx - tw - 8;
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      ctx.fillRect(tx, padT + 4, tw, 22);
      ctx.fillStyle = '#dfe7ef';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label, tx + 7, padT + 15);
    }
  }

  private renderOptimumPanel(): HTMLElement {
    const p = this.panel('Global Optimum');
    const body = el('div', 'pbody');
    const g = this.world.getGlobalMinima()[0];

    const grid = el('div', 'wc-meta');
    grid.style.padding = '4px 8px 10px';
    grid.style.fontSize = '12px';
    if (g) {
      grid.innerHTML =
        `<div><b>x₁</b> ${g.x1.toFixed(4)}</div>` +
        `<div><b>x₂</b> ${g.x2.toFixed(4)}</div>` +
        `<div style="margin-top:6px;font-size:16px;color:var(--accent)">f* = ${g.value.toFixed(4)}</div>`;
    } else {
      grid.textContent = 'No global optimum defined.';
    }
    body.appendChild(grid);

    const focus = el('button', 'btn primary wide');
    focus.textContent = 'Focus Camera';
    focus.style.width = '100%';
    focus.addEventListener('click', () => this.callbacks.onFocusOptimum());
    body.appendChild(focus);

    p.appendChild(body);
    return p;
  }

  private renderSettingsPanel(): HTMLElement {
    const p = this.panel('Settings');
    const body = el('div', 'pbody');
    const cfg = this.world.getConfig();

    const advanced = el('details', 'ui-disclosure'); advanced.append(el('summary', '', 'Advanced settings'));
    const qualityLabel = el('div', 'group-label', 'Visual quality'); body.append(qualityLabel);
    const quality = el('div', 'seg ui-quality');
    for (const [value, label] of [['performance', 'Performance'], ['balanced', 'Balanced'], ['presentation', 'Cinematic']] as const) {
      const button = el('button', cfg.visualQuality === value ? 'active' : '', label); button.setAttribute('aria-pressed', String(cfg.visualQuality === value));
      button.addEventListener('click', () => { this.callbacks.onVisualQualityChange(value); this.refreshOpenTool(); }); quality.append(button);
    } body.append(quality);
    const resRow = el('div', 'row');
    resRow.appendChild(el('span', 'grow', 'Resolution'));
    const resSel = el('select', 'select') as HTMLSelectElement;
    resSel.style.width = '150px';
    for (const level of RESOLUTION_LEVELS) {
      const opt = el('option') as HTMLOptionElement;
      opt.value = String(level.resolution);
      opt.textContent = `${level.name} (${level.resolution}²)`;
      resSel.appendChild(opt);
    }
    resSel.value = String(cfg.resolution);
    resSel.addEventListener('change', () => this.callbacks.onResolutionChange(parseInt(resSel.value, 10)));
    resRow.appendChild(resSel);
    advanced.appendChild(resRow);

    const normRow = el('div', 'row');
    normRow.appendChild(el('span', 'grow', 'Normalization'));
    const normSel = el('select', 'select') as HTMLSelectElement;
    normSel.style.width = '150px';
    for (const [label, value] of [['Linear', 'linear'], ['Log', 'log'], ['Quantile', 'quantile'], ['Clamped', 'clamped-percentile']] as const) {
      const opt = el('option') as HTMLOptionElement;
      opt.value = value; opt.textContent = label;
      normSel.appendChild(opt);
    }
    normSel.value = cfg.normalizationMode;
    normSel.addEventListener('change', () => this.callbacks.onNormalizationChange(normSel.value as NormalizationMode));
    normRow.appendChild(normSel);
    advanced.appendChild(normRow);

    const scaleRow = el('div', 'row');
    scaleRow.appendChild(el('span', 'grow', 'Vertical scale'));
    const scaleVal = el('span', 'mono', cfg.verticalScale.toFixed(1));
    scaleRow.appendChild(scaleVal);
    advanced.appendChild(scaleRow);
    const scale = el('input') as HTMLInputElement;
    scale.type = 'range'; scale.min = '0.4'; scale.max = '2.6'; scale.step = '0.1';
    scale.value = String(cfg.verticalScale);
    scale.style.margin = '0 8px 6px'; scale.style.width = 'calc(100% - 16px)';
    scale.addEventListener('input', () => {
      scaleVal.textContent = parseFloat(scale.value).toFixed(1);
      this.callbacks.onVerticalScaleChange(parseFloat(scale.value));
    });
    advanced.appendChild(scale);
    scale.setAttribute("aria-label", "Vertical scale"); body.append(advanced);
    body.append(el("p", "ui-help", "Motion follows your system preference. Quality affects visual detail only."));

    p.appendChild(body);
    return p;
  }

  private refreshOpenTool(): void {
    if (this.activeTool) this.openTool(this.activeTool);
  }

  // ============================================================= VIEW MODE
  private renderViewModeButtons(mode: ViewMode): void {
    for (const [m, btn] of this.viewButtons) { btn.classList.toggle('active', m === mode); btn.setAttribute('aria-pressed', String(m === mode)); }
  }

  setViewMode(mode: ViewMode): void {
    this.renderViewModeButtons(mode);
    this.callbacks.onViewModeChange(mode);
  }

  // ============================================================= PROBE
  setProbe(data: ProbeData | null): void {
    if (data) {
      this.telX1.textContent = data.x1.toFixed(3);
      this.telX2.textContent = data.x2.toFixed(3);
      this.telF.textContent = data.cost.toFixed(4);
      this.telG.textContent = data.gradientMagnitude.toFixed(2);
      this.telBasin.textContent = data.basinId != null && data.basinId >= 0 ? `#${data.basinId}` : '—';

      this.pcX1.textContent = data.x1.toFixed(4);
      this.pcX2.textContent = data.x2.toFixed(4);
      this.pcF.textContent = `f = ${data.cost.toFixed(4)}`;
      this.pcG.textContent = data.gradientMagnitude.toFixed(2);
      this.pcSlope.textContent = data.slope.toFixed(3);
      this.pcCurvature.textContent = data.curvature.toFixed(3);
      this.pcBasin.textContent = data.basinId != null && data.basinId >= 0 ? `#${data.basinId}` : '—';

      this.positionProbeCard();
      this.probeCard.classList.add('show');
    } else {
      this.probeCard.classList.remove('show');
      this.telX1.textContent = '—';
      this.telX2.textContent = '—';
      this.telF.textContent = '—';
      this.telG.textContent = '—';
      this.telBasin.textContent = '—';
    }
  }

  // ============================================================= INFO / SYNC
  private lastFunctionId = "";
  updateFunctionInfo(): void {
    const def = this.world.getFunction().definition;
    const story = STORIES[def.id];
    if (this.lastFunctionId && this.lastFunctionId !== def.id && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.fnNameEl.parentElement?.parentElement?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
    if (this.lastFunctionId !== def.id) { this.pinnedProbeData = []; this.renderPinnedProbes(); }
    this.lastFunctionId = def.id;
    this.fnNameEl.textContent = def.shortName || def.name;
    this.fnStoryEl.textContent = story?.subtitle ?? 'Optimization Landscape';

    if (def.source && def.source !== 'builtin') {
      const tags: string[] = [];
      const t = def.metadata.topologyNotes || '';
      if (def.source === 'challenge') tags.push('CHALLENGE'); else tags.push('CUSTOM');
      if (/noisy/i.test(t)) tags.push('NOISY');
      if (/constrained/i.test(t)) tags.push('CONSTRAINED');
      if (/dynamic/i.test(t)) tags.push('DYNAMIC');
      if (def.source === 'custom') tags.push('2 VARIABLES');
      this.fnClassEl.textContent = tags.join(' · ');
    } else {
      const cls = def.functionClass;
      const parts: string[] = [];
      if (cls === 'convex') parts.push('CONVEX', 'UNIMODAL');
      else if (cls === 'multimodal') parts.push('MULTIMODAL');
      else parts.push(cls.toUpperCase());
      parts.push('2D');
      this.fnClassEl.textContent = parts.join(' · ');
    }

    const g = this.world.getGlobalMinima()[0];
    const est = def.referenceSource === 'estimated' ? 'est. ' : '';
    this.telOpt.textContent = g
      ? `${est}f* ${g.value.toFixed(4)}`
      : '—';

    this.updatePresentMeta();
    this.highlightActiveWorld();
  }

  syncFromConfig(): void {
    const config = this.world.getConfig();
    this.renderViewModeButtons(config.viewMode);

    this.telemetry.classList.toggle('scientific', config.viewMode === 'scientific');
    this.probeCard.classList.toggle('sci', config.viewMode === 'scientific');

    this.updatePresentMeta();
    if (this.activeTool) this.openTool(this.activeTool);
    else if (this.crossEnabled) this.refreshCrossSection();
  }

  dispose(): void {
    this.releasePanelAnchor?.();
    this.topBar.remove();
    this.dock.remove();
    this.panelHost.remove();
    this.telemetry.remove();
    document.getElementById("ui-bottom")?.remove();
    this.probeCard.remove();
    this.worldModal.remove();
    this.fnDrawer.remove();
    this.present.remove();
    this.hint.remove();
  }
}
