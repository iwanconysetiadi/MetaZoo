import { parseExpression, EXPRESSION_EXAMPLES } from '../core/expression';
import { validateObjective, validateDomain } from '../core/custom/validation';
import { SearchDomain } from '../core/custom/ReferenceOptimum';
import {
  ChallengeDefinition, ChallengeBase, TransformDef, SyntheticBasin, ConstraintDef,
  IDENTITY_TRANSFORM, CustomObjectiveDefinition,
} from '../core/custom/ChallengeObjective';
import {
  makeCustomObjectiveDefinition, validateChallengeDefinition, newId, defaultDomainForBuiltin,
} from '../core/custom/factory';
import { saveCustomFunction, saveChallenge, saveSculptWorld } from '../core/custom/store';
import {
  SculptWorldDefinition, SculptFeature, SculptFeatureKind, SculptBase,
  composeSculptEval, makeSculptFeature, SCULPT_PRESETS, SCULPT_SCHEMA_VERSION, MAX_SCULPT_FEATURES,
} from '../core/sculpt/SculptObjective';
import { globalRegistry } from '../core/math/CostFunction';

export interface CustomLabHost {
  buildChallenge: (def: ChallengeDefinition) => void;
  buildSculpt: (def: SculptWorldDefinition) => void;
  editCurrent: () => void;
}

type LabMode = 'create' | 'sculpt' | 'challenge';

interface LabState {
  mode: LabMode;
  expression: string;
  name: string;
  description: string;
  domain: SearchDomain;
  base: ChallengeBase;
  baseLabel: string;
  transform: TransformDef;
  basins: SyntheticBasin[];
  constraints: ConstraintDef[];
  noiseOn: boolean;
  noiseSigma: number;
  seed: number;
  dynOn: boolean;
  dynMode: 'linear' | 'circular' | 'oscillating';
  dynAmplitude: number;
  dynSpeed: number;
  dynDepth: number;
  challengeId: string;
  savedFnId?: string;
}

function glyphFor(kind: SculptFeatureKind): string {
  return kind === 'valley' ? '▽' : kind === 'mountain' ? '△' : kind === 'ridge' ? '╱'
    : kind === 'plateau' ? '▰' : '◎';
}
function labelFor(kind: SculptFeatureKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export class CustomLab {
  private host: CustomLabHost;
  private root: HTMLElement;
  private state: LabState;
  private previewCanvas: HTMLCanvasElement | null = null;
  private statusEl: HTMLElement | null = null;
  private previewTimer = 0;

  // Sculpt state
  private sculptBase: SculptBase = { kind: 'blank' };
  private sculptFeatures: SculptFeature[] = [];
  private sculptTool: SculptFeatureKind | 'select' = 'select';
  private selectedFeatureId: string | null = null;
  private sculptHistory: string[] = [];
  private sculptFuture: string[] = [];
  private sculptId = newId('sculpt');

  constructor(host: CustomLabHost) {
    this.host = host;
    this.root = el('div');
    this.root.id = 'ui-lab';
    this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
    document.body.appendChild(this.root);
    this.state = this.blankState();
  }

  private blankState(): LabState {
    return {
      mode: 'create',
      expression: 'x1^2 + 2*x2^2 + 3*sin(x1*x2)',
      name: 'Custom Function',
      description: '',
      domain: { x1Min: -5, x1Max: 5, x2Min: -5, x2Max: 5 },
      base: { kind: 'builtin', id: 'sphere' },
      baseLabel: 'Sphere',
      transform: { ...IDENTITY_TRANSFORM },
      basins: [],
      constraints: [],
      noiseOn: false,
      noiseSigma: 0.4,
      seed: 1337,
      dynOn: false,
      dynMode: 'circular',
      dynAmplitude: 3,
      dynSpeed: 0.8,
      dynDepth: 30,
      challengeId: newId('challenge'),
    };
  }

  // ---------------------------------------------------------------- open
  openCreateWorld(def?: CustomObjectiveDefinition): void {
    this.state = this.blankState();
    this.state.mode = 'create';
    if (def) {
      this.state.expression = def.expression;
      this.state.name = def.name;
      this.state.domain = { ...def.domain };
      this.state.description = def.description ?? '';
    }
    this.render();
  }

  openChallengeBuilder(base: ChallengeBase, baseLabel: string): void {
    this.state = this.blankState();
    this.state.mode = 'challenge';
    this.state.base = base;
    this.state.baseLabel = baseLabel;
    this.state.name = `${baseLabel} Challenge`;
    if (base.kind === 'custom') {
      this.state.domain = { ...base.definition.domain };
      this.state.expression = base.definition.expression;
    } else {
      this.state.domain = defaultDomainForBuiltin(base.id);
    }
    this.render();
  }

  openSculpt(existing?: SculptWorldDefinition): void {
    this.state = this.blankState();
    this.state.mode = 'sculpt';
    this.sculptHistory = [];
    this.sculptFuture = [];
    if (existing) {
      this.state.name = existing.name;
      this.state.domain = { ...existing.domain };
      this.sculptBase = existing.base;
      this.sculptFeatures = existing.features.map(f => ({ ...f }));
      this.sculptId = existing.id;
      this.state.description = existing.metadata?.description ?? '';
    } else {
      this.sculptBase = { kind: 'blank' };
      this.sculptFeatures = [];
      this.sculptId = newId('sculpt');
    }
    this.selectedFeatureId = this.sculptFeatures[0]?.id ?? null;
    this.sculptTool = 'select';
    this.render();
  }

  /** QA/demo helper: open Sculpt with a single placed feature of the given kind. */
  openSculptDemo(kind: 'valley' | 'mountain' | 'ridge' | 'rotated'): void {
    this.openSculpt();
    let f: SculptFeature;
    if (kind === 'rotated') {
      f = makeSculptFeature('valley', 0, 0, this.state.domain);
      f.sigmaX1 = 4; f.sigmaX2 = 0.8; f.rotation = Math.PI / 4; f.amplitude = -8;
      this.sculptTool = 'select';
    } else if (kind === 'mountain') {
      f = makeSculptFeature('mountain', 2, 2, this.state.domain);
      this.sculptTool = 'mountain';
    } else if (kind === 'ridge') {
      f = makeSculptFeature('ridge', 0, 0, this.state.domain);
      this.sculptTool = 'ridge';
    } else {
      f = makeSculptFeature('valley', 0, 0, this.state.domain);
      this.sculptTool = 'valley';
    }
    this.sculptFeatures.push(f);
    this.selectedFeatureId = f.id;
    this.render();
  }

  private setStateMode(mode: 'create' | 'sculpt'): void {
    if (this.state.mode === mode) return;
    this.state.mode = mode;
    this.render();
  }

  close(): void {
    this.root.classList.remove('open');
    this.root.innerHTML = '';
    this.previewCanvas = null;
  }

  // ---------------------------------------------------------------- render
  private render(): void {
    this.root.classList.add('open');
    this.root.innerHTML = '';

    const shell = el('div', 'lab-shell');
    const mode = this.state.mode;
    const title = mode === 'create' ? 'Create Optimization World'
      : mode === 'sculpt' ? 'Sculpt Optimization World'
        : 'Make Challenge';

    const head = el('div', 'lab-head');
    const headLeft = el('div');
    headLeft.style.display = 'flex';
    headLeft.style.alignItems = 'center';
    headLeft.style.gap = '16px';
    headLeft.appendChild(el('h2', '', title));

    if (mode === 'create' || mode === 'sculpt') {
      const tabs = el('div', 'seg');
      const fTab = el('button', '', 'Formula');
      if (mode === 'create') fTab.classList.add('active');
      fTab.addEventListener('click', () => this.setStateMode('create'));
      const sTab = el('button', '', 'Sculpt');
      if (mode === 'sculpt') sTab.classList.add('active');
      sTab.addEventListener('click', () => this.setStateMode('sculpt'));
      tabs.appendChild(fTab);
      tabs.appendChild(sTab);
      headLeft.appendChild(tabs);
    }
    head.appendChild(headLeft);
    const headRight = el('div');
    headRight.style.display = 'flex';
    headRight.style.gap = '8px';
    if (mode === 'challenge') {
      const back = el('button', 'btn', '← Create World');
      back.addEventListener('click', () => this.host.editCurrent());
      headRight.appendChild(back);
    }
    const closeBtn = el('button', 'icon-btn', '✕');
    closeBtn.addEventListener('click', () => this.close());
    headRight.appendChild(closeBtn);
    head.appendChild(headRight);
    shell.appendChild(head);

    const body = el('div', 'lab-body');
    const left = el('div', 'lab-col left');
    const right = el('div', 'lab-col');
    left.id = 'lab-left';
    right.id = 'lab-right';
    body.appendChild(left);
    body.appendChild(right);
    shell.appendChild(body);

    this.root.appendChild(shell);

    this.renderLeft(left);
    this.renderRight(right);
    this.schedulePreview(50);
  }

  private numInput(value: number, step: string, onInput: (v: number) => void): HTMLInputElement {
    const inp = el('input', 'lab-input') as HTMLInputElement;
    inp.type = 'number';
    inp.step = step;
    inp.value = String(value);
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (isFinite(v)) { onInput(v); this.schedulePreview(); }
    });
    return inp;
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const f = el('div', 'lab-field');
    f.appendChild(el('label', '', label));
    f.appendChild(control);
    return f;
  }

  private makeSwitch(on: boolean, onChange: (v: boolean) => void): HTMLElement {
    const s = el('div', 'switch' + (on ? ' on' : ''));
    s.addEventListener('click', () => {
      const v = !s.classList.contains('on');
      s.classList.toggle('on', v);
      onChange(v);
      this.render();
    });
    return s;
  }

  private renderLeft(container: HTMLElement): void {
    if (this.state.mode === 'create') this.renderCreateControls(container);
    else if (this.state.mode === 'sculpt') this.renderSculptControls(container);
    else this.renderChallengeControls(container);
  }

  private renderCreateControls(container: HTMLElement): void {
    const s = this.state;

    const expr = el('textarea', 'lab-textarea') as HTMLTextAreaElement;
    expr.value = s.expression;
    expr.spellcheck = false;
    expr.placeholder = 'e.g. x1^2 + 2*x2^2 + 3*sin(x1*x2)';
    expr.addEventListener('input', () => { s.expression = expr.value; this.schedulePreview(); });
    container.appendChild(this.field('f(x₁, x₂) =', expr));

    // Domain
    const domWrap = el('div');
    const row1 = el('div', 'lab-grid2');
    row1.appendChild(this.field('x₁ min', this.numInput(s.domain.x1Min, '0.1', v => { s.domain.x1Min = v; })));
    row1.appendChild(this.field('x₁ max', this.numInput(s.domain.x1Max, '0.1', v => { s.domain.x1Max = v; })));
    const row2 = el('div', 'lab-grid2');
    row2.appendChild(this.field('x₂ min', this.numInput(s.domain.x2Min, '0.1', v => { s.domain.x2Min = v; })));
    row2.appendChild(this.field('x₂ max', this.numInput(s.domain.x2Max, '0.1', v => { s.domain.x2Max = v; })));
    domWrap.appendChild(row1);
    domWrap.appendChild(row2);
    container.appendChild(el('div', 'lab-section', 'Domain'));
    container.appendChild(domWrap);

    const nameInp = el('input', 'lab-input') as HTMLInputElement;
    nameInp.value = s.name;
    nameInp.addEventListener('input', () => { s.name = nameInp.value; });
    container.appendChild(this.field('Name', nameInp));

    container.appendChild(el('div', 'lab-section', 'Examples'));
    const chips = el('div');
    for (const ex of EXPRESSION_EXAMPLES) {
      const chip = el('span', 'lab-chip', ex.name);
      chip.addEventListener('click', () => {
        this.state.expression = ex.expression;
        if (this.state.name === 'Custom Function') this.state.name = ex.name;
        this.render();
      });
      chips.appendChild(chip);
    }
    container.appendChild(chips);

    const hint = el('div', 'lab-mini');
    hint.style.marginTop = '10px';
    hint.textContent = 'Variables x₁ x₂ · constants pi e · operators + − × ÷ ^ · functions sin cos tan exp log sqrt abs min max …';
    container.appendChild(hint);
  }

  private renderChallengeControls(container: HTMLElement): void {
    const s = this.state;

    const baseBox = el('div', 'lab-linked', `Base:  ${s.baseLabel}`);
    container.appendChild(baseBox);

    container.appendChild(el('div', 'lab-section', 'Transform'));
    const tGrid = el('div', 'lab-grid2');
    tGrid.appendChild(this.field('Rotate θ (°)', this.numInput((s.transform.rotation * 180) / Math.PI, '1', v => { s.transform.rotation = (v * Math.PI) / 180; })));
    tGrid.appendChild(this.field('Seed', this.numInput(s.seed, '1', v => { s.seed = Math.round(v); })));
    tGrid.appendChild(this.field('Shift x₁', this.numInput(s.transform.translationX, '0.1', v => { s.transform.translationX = v; })));
    tGrid.appendChild(this.field('Shift x₂', this.numInput(s.transform.translationX2, '0.1', v => { s.transform.translationX2 = v; })));
    tGrid.appendChild(this.field('Scale x₁', this.numInput(s.transform.scaleX1, '0.1', v => { s.transform.scaleX1 = v || 1; })));
    tGrid.appendChild(this.field('Scale x₂', this.numInput(s.transform.scaleX2, '0.1', v => { s.transform.scaleX2 = v || 1; })));
    container.appendChild(tGrid);

    // Basins / false oasis
    const basinHead = el('div', 'lab-section');
    basinHead.appendChild(el('span', '', 'Landscape basins'));
    const addBasin = el('button', 'btn', '+ False oasis');
    addBasin.style.padding = '4px 9px';
    addBasin.addEventListener('click', () => {
      if (s.basins.length >= 4) return;
      s.basins.push({ x1: 0, x2: 0, depth: 6, radius: 1.5 });
      this.render();
    });
    basinHead.appendChild(addBasin);
    container.appendChild(basinHead);
    s.basins.forEach((b, idx) => {
      const item = el('div', 'lab-item');
      const hdr = el('div', 'lab-row');
      hdr.appendChild(el('span', '', `Basin ${idx + 1}`));
      const rm = el('button', 'btn', 'remove');
      rm.style.padding = '3px 8px';
      rm.addEventListener('click', () => { s.basins.splice(idx, 1); this.render(); });
      hdr.appendChild(rm);
      item.appendChild(hdr);
      const g = el('div', 'lab-grid4');
      g.appendChild(this.numInput(b.x1, '0.1', v => { b.x1 = v; }));
      g.appendChild(this.numInput(b.x2, '0.1', v => { b.x2 = v; }));
      g.appendChild(this.numInput(b.depth, '0.5', v => { b.depth = v; }));
      g.appendChild(this.numInput(b.radius, '0.1', v => { b.radius = Math.max(0.05, v); }));
      item.appendChild(g);
      const lbl = el('div', 'lab-mini', 'x₁ · x₂ · depth · radius');
      item.appendChild(lbl);
      container.appendChild(item);
    });

    // Constraints
    const cHead = el('div', 'lab-section');
    cHead.appendChild(el('span', '', 'Constraints'));
    const addC = el('button', 'btn', '+ Circle');
    addC.style.padding = '4px 9px';
    addC.addEventListener('click', () => {
      s.constraints.push({ id: newId('c'), shape: { kind: 'circle', cx: 0, cz: 0, r: 3 }, mode: 'forbidden' });
      this.render();
    });
    const addRect = el('button', 'btn', '+ Rect');
    addRect.style.padding = '4px 9px';
    addRect.style.marginLeft = '6px';
    addRect.addEventListener('click', () => {
      s.constraints.push({ id: newId('c'), shape: { kind: 'rect', x1Min: -2, x1Max: 2, x2Min: -2, x2Max: 2 }, mode: 'forbidden' });
      this.render();
    });
    cHead.appendChild(addC);
    cHead.appendChild(addRect);
    container.appendChild(cHead);
    s.constraints.forEach((c, idx) => {
      const item = el('div', 'lab-item');
      const hdr = el('div', 'lab-row');
      const modeSel = el('select', 'select') as HTMLSelectElement;
      modeSel.style.width = '120px';
      for (const m of ['forbidden', 'allowed']) {
        const o = el('option') as HTMLOptionElement; o.value = m; o.textContent = m;
        modeSel.appendChild(o);
      }
      modeSel.value = c.mode;
      modeSel.addEventListener('change', () => { c.mode = modeSel.value as 'allowed' | 'forbidden'; this.schedulePreview(); });
      hdr.appendChild(modeSel);
      const rm = el('button', 'btn', 'remove');
      rm.style.padding = '3px 8px';
      rm.addEventListener('click', () => { s.constraints.splice(idx, 1); this.render(); });
      hdr.appendChild(rm);
      item.appendChild(hdr);
      if (c.shape.kind === 'circle') {
        const g = el('div', 'lab-grid4');
        g.appendChild(this.numInput(c.shape.cx, '0.1', v => { if (c.shape.kind === 'circle') c.shape.cx = v; }));
        g.appendChild(this.numInput(c.shape.cz, '0.1', v => { if (c.shape.kind === 'circle') c.shape.cz = v; }));
        g.appendChild(this.numInput(c.shape.r, '0.1', v => { if (c.shape.kind === 'circle') c.shape.r = Math.max(0.05, v); }));
        item.appendChild(g);
        item.appendChild(el('div', 'lab-mini', 'circle · cx · cz · r'));
      } else if (c.shape.kind === 'rect') {
        const g = el('div', 'lab-grid4');
        g.appendChild(this.numInput(c.shape.x1Min, '0.1', v => { if (c.shape.kind === 'rect') c.shape.x1Min = v; }));
        g.appendChild(this.numInput(c.shape.x1Max, '0.1', v => { if (c.shape.kind === 'rect') c.shape.x1Max = v; }));
        g.appendChild(this.numInput(c.shape.x2Min, '0.1', v => { if (c.shape.kind === 'rect') c.shape.x2Min = v; }));
        g.appendChild(this.numInput(c.shape.x2Max, '0.1', v => { if (c.shape.kind === 'rect') c.shape.x2Max = v; }));
        item.appendChild(g);
        item.appendChild(el('div', 'lab-mini', 'rect · x₁min · x₁max · x₂min · x₂max'));
      }
      container.appendChild(item);
    });

    // Noise
    const nHead = el('div', 'lab-section');
    nHead.appendChild(el('span', '', 'Gaussian noise'));
    nHead.appendChild(this.makeSwitch(s.noiseOn, v => { s.noiseOn = v; }));
    container.appendChild(nHead);
    if (s.noiseOn) {
      container.appendChild(this.field('Standard deviation σ', this.numInput(s.noiseSigma, '0.05', v => { s.noiseSigma = Math.max(0, v); })));
    }

    // Dynamics
    const dHead = el('div', 'lab-section');
    dHead.appendChild(el('span', '', 'Moving oasis'));
    dHead.appendChild(this.makeSwitch(s.dynOn, v => { s.dynOn = v; }));
    container.appendChild(dHead);
    if (s.dynOn) {
      const dGrid = el('div', 'lab-grid2');
      const modeSel = el('select', 'select') as HTMLSelectElement;
      for (const m of ['circular', 'linear', 'oscillating']) {
        const o = el('option') as HTMLOptionElement; o.value = m; o.textContent = m;
        modeSel.appendChild(o);
      }
      modeSel.value = s.dynMode;
      modeSel.addEventListener('change', () => { s.dynMode = modeSel.value as LabState['dynMode']; this.schedulePreview(); });
      dGrid.appendChild(this.field('Motion', modeSel));
      dGrid.appendChild(this.field('Amplitude', this.numInput(s.dynAmplitude, '0.5', v => { s.dynAmplitude = v; })));
      dGrid.appendChild(this.field('Speed', this.numInput(s.dynSpeed, '0.1', v => { s.dynSpeed = v; })));
      dGrid.appendChild(this.field('Depth', this.numInput(s.dynDepth, '1', v => { s.dynDepth = v; })));
      container.appendChild(dGrid);
    }
  }

  // ---------------------------------------------------------------- sculpt
  private sculptBaseLabel(): string {
    if (this.sculptBase.kind === 'blank') return 'Blank World';
    if (this.sculptBase.kind === 'builtin') {
      const fn = globalRegistry.get(this.sculptBase.id);
      return fn ? (fn.definition.shortName || fn.definition.name) : this.sculptBase.id;
    }
    return this.sculptBase.definition.name;
  }

  private makeSwitchInline(on: boolean, onChange: (v: boolean) => void): HTMLElement {
    const s = el('div', 'switch' + (on ? ' on' : ''));
    s.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = !s.classList.contains('on');
      s.classList.toggle('on', v);
      onChange(v);
    });
    return s;
  }

  private sliderField(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLElement {
    const f = el('div', 'lab-field');
    f.appendChild(el('label', '', label));
    const row = el('div');
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'center';
    const range = el('input') as HTMLInputElement;
    range.type = 'range'; range.min = String(min); range.max = String(max); range.step = String(step);
    range.value = String(value); range.style.flex = '1';
    const num = el('input', 'lab-input') as HTMLInputElement;
    num.type = 'number'; num.step = String(step); num.value = String(value); num.style.width = '84px';
    const apply = (v: number) => { onChange(v); this.schedulePreview(); };
    range.addEventListener('input', () => { const v = parseFloat(range.value); num.value = String(v); apply(v); });
    num.addEventListener('input', () => { const v = parseFloat(num.value); if (isFinite(v)) { range.value = String(v); apply(v); } });
    row.appendChild(range); row.appendChild(num); f.appendChild(row);
    return f;
  }

  private renderSculptControls(container: HTMLElement): void {
    const s = this.state;

    container.appendChild(el('div', 'lab-section', 'Domain'));
    const r1 = el('div', 'lab-grid2');
    r1.appendChild(this.field('x₁ min', this.numInput(s.domain.x1Min, '0.1', v => { s.domain.x1Min = v; })));
    r1.appendChild(this.field('x₁ max', this.numInput(s.domain.x1Max, '0.1', v => { s.domain.x1Max = v; })));
    const r2 = el('div', 'lab-grid2');
    r2.appendChild(this.field('x₂ min', this.numInput(s.domain.x2Min, '0.1', v => { s.domain.x2Min = v; })));
    r2.appendChild(this.field('x₂ max', this.numInput(s.domain.x2Max, '0.1', v => { s.domain.x2Max = v; })));
    container.appendChild(r1); container.appendChild(r2);

    const baseField = this.field('Base world', (() => {
      const sel = el('select', 'select') as HTMLSelectElement;
      const opts: Array<[string, string]> = [
        ['blank', 'Blank World'], ['sphere', 'Sphere'], ['rastrigin', 'Rastrigin'],
        ['ackley', 'Ackley'], ['rosenbrock', 'Rosenbrock'], ['himmelblau', 'Himmelblau'],
      ];
      for (const [v, l] of opts) { const o = el('option') as HTMLOptionElement; o.value = v; o.textContent = l; sel.appendChild(o); }
      sel.value = this.sculptBase.kind === 'blank' ? 'blank' : (this.sculptBase.kind === 'builtin' ? this.sculptBase.id : 'blank');
      sel.addEventListener('change', () => {
        this.pushHistory();
        const v = sel.value;
        if (v === 'blank') this.sculptBase = { kind: 'blank' };
        else { this.sculptBase = { kind: 'builtin', id: v }; this.state.domain = defaultDomainForBuiltin(v); }
        this.render();
      });
      return sel;
    })());
    container.appendChild(baseField);

    const nameInp = el('input', 'lab-input') as HTMLInputElement;
    nameInp.value = s.name;
    nameInp.addEventListener('input', () => { s.name = nameInp.value; });
    container.appendChild(this.field('Name', nameInp));

    // Tool palette
    container.appendChild(el('div', 'lab-section', 'Tools'));
    const palette = el('div');
    const tools: Array<[SculptFeatureKind | 'select', string, string]> = [
      ['select', 'Select', '⌖'], ['valley', 'Valley', '▽'], ['mountain', 'Mountain', '△'],
      ['ridge', 'Ridge', '╱'], ['basin', 'Basin', '◎'], ['plateau', 'Plateau', '▰'],
    ];
    for (const [t, label, glyph] of tools) {
      const chip = el('span', 'lab-chip', `${glyph} ${label}`);
      if (this.sculptTool === t) { chip.style.borderColor = 'var(--accent)'; chip.style.color = 'var(--accent)'; }
      chip.addEventListener('click', () => { this.sculptTool = t; this.render(); });
      palette.appendChild(chip);
    }
    container.appendChild(palette);

    // Teaching presets
    container.appendChild(el('div', 'lab-section', 'Teaching presets'));
    const presetWrap = el('div');
    for (const p of SCULPT_PRESETS) {
      const chip = el('span', 'lab-chip', p.name);
      chip.title = p.purpose;
      chip.addEventListener('click', () => {
        this.pushHistory();
        const d = p.build();
        this.sculptBase = d.base;
        this.sculptFeatures = d.features.map(f => ({ ...f }));
        this.state.domain = { ...d.domain };
        this.state.name = d.name;
        this.selectedFeatureId = this.sculptFeatures[0]?.id ?? null;
        this.render();
      });
      presetWrap.appendChild(chip);
    }
    container.appendChild(presetWrap);

    // Feature stack
    const fHead = el('div', 'lab-section');
    fHead.appendChild(el('span', '', `Features (${this.sculptFeatures.length}/${MAX_SCULPT_FEATURES})`));
    const clear = el('button', 'btn', 'Clear');
    clear.style.padding = '4px 9px';
    clear.addEventListener('click', () => {
      if (this.sculptFeatures.length === 0) return;
      this.pushHistory();
      this.sculptFeatures = [];
      this.selectedFeatureId = null;
      this.render();
    });
    fHead.appendChild(clear);
    container.appendChild(fHead);

    if (this.sculptFeatures.length === 0) {
      container.appendChild(el('div', 'lab-mini', 'No features yet — pick a tool and click the preview map, or load a teaching preset.'));
    }

    for (const f of this.sculptFeatures) {
      const item = el('div', 'lab-item');
      item.style.cursor = 'pointer';
      if (f.id === this.selectedFeatureId) item.style.borderColor = 'var(--accent)';
      const row = el('div', 'lab-row');
      const nm = el('span', '');
      nm.textContent = `${glyphFor(f.kind)} ${labelFor(f.kind)} · ${f.amplitude.toFixed(1)}`;
      row.appendChild(nm);
      row.appendChild(this.makeSwitchInline(f.enabled, v => { this.pushHistory(); f.enabled = v; })); 
      item.appendChild(row);
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('switch')) return;
        this.selectedFeatureId = f.id;
        this.render();
      });
      container.appendChild(item);
    }

    const sel = this.sculptFeatures.find(f => f.id === this.selectedFeatureId);
    if (sel) {
      container.appendChild(el('div', 'lab-section', 'Selected feature'));
      const isNegative = sel.kind === 'valley' || sel.kind === 'basin';
      const ampLabel = isNegative ? 'Depth' : 'Height';
      const ampDisplay = isNegative ? Math.abs(sel.amplitude) : sel.amplitude;
      container.appendChild(this.sliderField(ampLabel, ampDisplay, 0, 20, 0.5, v => {
        sel.amplitude = isNegative ? -Math.abs(v) : Math.abs(v);
      }));
      container.appendChild(this.sliderField('Width x₁', sel.sigmaX1, 0.2, 8, 0.1, v => { sel.sigmaX1 = v; }));
      container.appendChild(this.sliderField('Width x₂', sel.sigmaX2, 0.2, 8, 0.1, v => { sel.sigmaX2 = v; }));
      container.appendChild(this.sliderField('Rotation °', (sel.rotation * 180) / Math.PI, -180, 180, 1, v => { sel.rotation = (v * Math.PI) / 180; }));
      const posRow = el('div', 'lab-grid2');
      posRow.appendChild(this.field('Center x₁', this.numInput(sel.x1, '0.1', v => { sel.x1 = v; })));
      posRow.appendChild(this.field('Center x₂', this.numInput(sel.x2, '0.1', v => { sel.x2 = v; })));
      container.appendChild(posRow);
      if (sel.kind === 'plateau') {
        container.appendChild(this.sliderField('Edge softness', sel.softness ?? 2, 1, 6, 0.5, v => { sel.softness = v; }));
      }
      const act = el('div', 'lab-actions');
      const dup = el('button', 'btn', 'Duplicate');
      dup.addEventListener('click', () => {
        this.pushHistory();
        const clone: SculptFeature = { ...sel, id: makeSculptFeature(sel.kind, sel.x1, sel.x2, this.state.domain).id, x1: sel.x1 + 0.6 };
        this.sculptFeatures.push(clone);
        this.selectedFeatureId = clone.id;
        this.render();
      });
      const del = el('button', 'btn', 'Delete');
      del.addEventListener('click', () => {
        this.pushHistory();
        this.sculptFeatures = this.sculptFeatures.filter(f => f.id !== sel.id);
        this.selectedFeatureId = this.sculptFeatures[0]?.id ?? null;
        this.render();
      });
      act.appendChild(dup); act.appendChild(del);
      container.appendChild(act);
    }
  }

  private onSculptCanvasClick(e: MouseEvent): void {
    if (this.sculptTool === 'select') return;
    if (this.sculptFeatures.length >= MAX_SCULPT_FEATURES) {
      this.setStatus(`Feature cap reached (${MAX_SCULPT_FEATURES}).`, 'lab-status warn');
      return;
    }
    const canvas = this.previewCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ux = (e.clientX - rect.left) / rect.width;
    const uy = (e.clientY - rect.top) / rect.height;
    const x1 = this.state.domain.x1Min + ux * (this.state.domain.x1Max - this.state.domain.x1Min);
    const x2 = this.state.domain.x2Min + uy * (this.state.domain.x2Max - this.state.domain.x2Min);

    const kind = this.sculptTool as SculptFeatureKind;
    this.pushHistory();
    const f = makeSculptFeature(kind, x1, x2, this.state.domain);
    this.sculptFeatures.push(f);
    this.selectedFeatureId = f.id;
    this.sculptTool = 'select';
    this.render();
  }

  private toSculptDefinition(): SculptWorldDefinition {
    return {
      schemaVersion: SCULPT_SCHEMA_VERSION,
      id: this.sculptId,
      name: this.state.name || 'Sculpted World',
      domain: { ...this.state.domain },
      base: this.sculptBase,
      features: this.sculptFeatures.map(f => ({ ...f })),
      metadata: { tags: ['sculpted'], description: this.state.description },
    };
  }

  private pushHistory(): void {
    this.sculptHistory.push(JSON.stringify(this.sculptFeatures));
    if (this.sculptHistory.length > 50) this.sculptHistory.shift();
    this.sculptFuture = [];
  }

  private undoSculpt(): void {
    if (this.sculptHistory.length === 0) return;
    this.sculptFuture.push(JSON.stringify(this.sculptFeatures));
    this.sculptFeatures = JSON.parse(this.sculptHistory.pop()!) as SculptFeature[];
    if (!this.sculptFeatures.some(f => f.id === this.selectedFeatureId)) {
      this.selectedFeatureId = this.sculptFeatures[0]?.id ?? null;
    }
    this.render();
  }

  private redoSculpt(): void {
    if (this.sculptFuture.length === 0) return;
    this.sculptHistory.push(JSON.stringify(this.sculptFeatures));
    this.sculptFeatures = JSON.parse(this.sculptFuture.pop()!) as SculptFeature[];
    if (!this.sculptFeatures.some(f => f.id === this.selectedFeatureId)) {
      this.selectedFeatureId = this.sculptFeatures[0]?.id ?? null;
    }
    this.render();
  }

  private resetSculpt(): void {
    this.pushHistory();
    this.sculptFeatures = [];
    this.selectedFeatureId = null;
    this.render();
  }

  private buildSculptNow(): void {
    if (!validateDomain(this.state.domain).ok) {
      this.fail(`Unable to build this world.\n\n${validateDomain(this.state.domain).errors.join('\n')}`);
      return;
    }
    try {
      this.host.buildSculpt(this.toSculptDefinition());
      this.close();
    } catch (e) {
      this.fail(`Unable to build this world.\n\n${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private saveSculptNow(): void {
    saveSculptWorld(this.toSculptDefinition());
    this.setStatus('✓ Sculpted world saved to My Worlds.', 'lab-status ok');
  }

  private renderRight(container: HTMLElement): void {
    const s = this.state;

    const preview = el('canvas', 'lab-preview') as HTMLCanvasElement;
    preview.width = 420; preview.height = 350;
    this.previewCanvas = preview;
    container.appendChild(preview);

    const status = el('div', 'lab-status', '');
    this.statusEl = status;
    container.appendChild(status);

    const actions = el('div', 'lab-actions');

    const build = el('button', 'btn primary', 'BUILD WORLD →');
    build.style.fontSize = '13px';
    build.style.padding = '11px 20px';
    build.addEventListener('click', () => {
      if (s.mode === 'sculpt') this.buildSculptNow();
      else this.attemptBuild();
    });
    actions.appendChild(build);

    if (s.mode === 'create') {
      const saveFn = el('button', 'btn', 'Save Function');
      saveFn.addEventListener('click', () => this.saveFunction());
      actions.appendChild(saveFn);
    } else if (s.mode === 'sculpt') {
      const undo = el('button', 'btn', 'Undo');
      undo.addEventListener('click', () => this.undoSculpt());
      actions.appendChild(undo);
      const redo = el('button', 'btn', 'Redo');
      redo.addEventListener('click', () => this.redoSculpt());
      actions.appendChild(redo);
      const reset = el('button', 'btn', 'Reset Sculpt');
      reset.addEventListener('click', () => this.resetSculpt());
      actions.appendChild(reset);
      const saveW = el('button', 'btn', 'Save World');
      saveW.addEventListener('click', () => this.saveSculptNow());
      actions.appendChild(saveW);
    } else {
      const apply = el('button', 'btn', 'Apply Challenge');
      apply.addEventListener('click', () => this.attemptBuild());
      actions.appendChild(apply);
      const saveCh = el('button', 'btn', 'Save Challenge');
      saveCh.addEventListener('click', () => this.saveChallengeNow());
      actions.appendChild(saveCh);
      const exportBtn = el('button', 'btn', 'Export JSON');
      exportBtn.addEventListener('click', () => this.exportJSON());
      actions.appendChild(exportBtn);
      const importBtn = el('button', 'btn', 'Import JSON');
      importBtn.addEventListener('click', () => this.importJSON());
      actions.appendChild(importBtn);
    }
    container.appendChild(actions);

    const note = el('div', 'lab-mini');
    note.style.marginTop = '12px';
    note.textContent = s.mode === 'create'
      ? 'Build World validates the expression internally and enters a real interactive optimization world. A small preview updates as you type.'
      : s.mode === 'sculpt'
        ? 'Pick a tool and click the map to place features. Every feature is a signed analytic term added to the objective, then Build World renders it in the real engine.'
        : 'Making a challenge rebuilds the world with your mathematical modifications. The base stays the same; you add controlled difficulty.';
    container.appendChild(note);

    if (s.mode === 'sculpt') {
      preview.style.cursor = this.sculptTool === 'select' ? 'default' : 'crosshair';
      preview.addEventListener('mousedown', (e) => this.onSculptCanvasClick(e));
    }
  }

  // ---------------------------------------------------------------- preview
  private schedulePreview(delay = 350): void {
    if (this.previewTimer) window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.validateAndPreview(), delay);
  }

  private buildPreviewEvaluator(): ((x1: number, x2: number) => number) | null {
    const s = this.state;
    let baseEval: (x1: number, x2: number) => number;

    if (s.mode === 'create' || s.base.kind === 'custom') {
      const expr = s.mode === 'create' ? s.expression : (s.base.kind === 'custom' ? s.base.definition.expression : '');
      try {
        baseEval = parseExpression(expr).evaluate;
      } catch {
        return null;
      }
    } else {
      const fn = globalRegistry.get(s.base.id);
      if (!fn) return null;
      baseEval = (a, b) => fn.evaluate(a, b);
    }

    const t = s.transform;
    const basins = s.basins;
    const dyn = s.dynOn ? { enabled: true, amp: s.dynAmplitude, depth: s.dynDepth, cx: (s.domain.x1Min + s.domain.x1Max) / 2, cz: (s.domain.x2Min + s.domain.x2Max) / 2 } : null;
    const c = Math.cos(t.rotation), sn = Math.sin(t.rotation);

    return (x1: number, x2: number) => {
      const u1 = x1 - t.translationX;
      const u2 = x2 - t.translationX2;
      const r1 = c * u1 - sn * u2;
      const r2 = sn * u1 + c * u2;
      let v = baseEval(t.scaleX1 * r1, t.scaleX2 * r2);
      if (!isFinite(v)) return NaN;
      for (const b of basins) {
        const dx = x1 - b.x1, dz = x2 - b.x2;
        const rr = b.radiusX2 ?? b.radius;
        v += -b.depth * Math.exp(-0.5 * ((dx * dx) / (b.radius * b.radius) + (dz * dz) / (rr * rr)));
      }
      if (dyn) {
        const dx = x1 - dyn.cx, dz = x2 - dyn.cz;
        v += -dyn.depth * Math.exp(-0.5 * ((dx * dx + dz * dz) / (1.4 * 1.4)));
      }
      return v;
    };
  }

  private validateAndPreview(): void {
    if (!this.previewCanvas || !this.statusEl) return;
    const s = this.state;

    let statusText = '';
    let statusClass = 'lab-status ok';

    if (s.mode === 'create') {
      const v = validateObjective(s.expression, s.domain, 44);
      if (v.parseError) {
        statusText = `Expression error near position ${v.parseError.position}:\n${v.parseError.message}`;
        statusClass = 'lab-status err';
        this.drawPreview(null);
        this.setStatus(statusText, statusClass);
        return;
      }
      if (!validateDomain(s.domain).ok) {
        statusText = `Invalid domain:\n${validateDomain(s.domain).errors.join('\n')}`;
        statusClass = 'lab-status err';
        this.drawPreview(null);
        this.setStatus(statusText, statusClass);
        return;
      }
      const st = v.stats!;
      if (st.invalidFraction > 0.001) {
        statusText = `✓ Expression valid\n⚠ ${(st.invalidFraction * 100).toFixed(1)}% of sampled points are undefined.\nYou can still build with the valid region.`;
        statusClass = 'lab-status warn';
      } else {
        statusText = `✓ Expression valid\nRange ≈ [${st.min.toPrecision(3)}, ${st.max.toPrecision(3)}]`;
        statusClass = 'lab-status ok';
      }
    } else if (s.mode === 'sculpt') {
      const domainOk = validateDomain(s.domain).ok;
      if (!domainOk) {
        statusText = `Invalid domain:\n${validateDomain(s.domain).errors.join('\n')}`;
        statusClass = 'lab-status err';
        this.setStatus(statusText, statusClass);
        this.drawPreview(null);
        return;
      }
      const active = this.sculptFeatures.filter(f => f.enabled).length;
      statusText = `✓ Sculpt ready · ${active} feature${active === 1 ? '' : 's'}\nBase: ${this.sculptBaseLabel()} · click the map with a tool to place features.`;
      statusClass = 'lab-status ok';
      this.setStatus(statusText, statusClass);
      this.drawPreview(composeSculptEval(this.toSculptDefinition()));
      return;
    } else {
      const domainOk = validateDomain(s.domain).ok;
      if (!domainOk) {
        statusText = 'Invalid domain.';
        statusClass = 'lab-status err';
      } else {
        statusText = '✓ Challenge configuration ready';
        statusClass = 'lab-status ok';
      }
    }

    this.setStatus(statusText, statusClass);
    this.drawPreview(this.buildPreviewEvaluator());
  }

  private setStatus(text: string, cls: string): void {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.className = cls;
  }

  private drawPreview(evalFn: ((x1: number, x2: number) => number) | null): void {
    const canvas = this.previewCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;

    if (!evalFn) {
      ctx.fillStyle = '#0b1016';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    const s = this.state;
    const N = 90;
    const vals = new Float32Array(N * N);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < N; i++) {
      const x1 = s.domain.x1Min + (i / (N - 1)) * (s.domain.x1Max - s.domain.x1Min);
      for (let j = 0; j < N; j++) {
        const x2 = s.domain.x2Min + (j / (N - 1)) * (s.domain.x2Max - s.domain.x2Min);
        let v = evalFn(x1, x2);
        if (!isFinite(v)) v = NaN;
        vals[i * N + j] = v;
        if (isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
      }
    }
    if (!isFinite(min) || !isFinite(max) || max === min) { min = 0; max = 1; }

    const small = document.createElement('canvas');
    small.width = N; small.height = N;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(N, N);

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const v = vals[i * N + j];
        const idx = (j * N + i) * 4;
        if (!isFinite(v)) {
          img.data[idx] = 18; img.data[idx + 1] = 22; img.data[idx + 2] = 28; img.data[idx + 3] = 255;
          continue;
        }
        const t = (v - min) / (max - min);
        // low = green (optimal), high = tan/stone
        const r = Math.round(28 + t * 120);
        const g = Math.round(120 - t * 40);
        const bl = Math.round(60 - t * 10);
        const band = Math.abs(((t * 12) % 1) - 0.5) < 0.03 ? 28 : 0;
        img.data[idx] = Math.min(255, r + band);
        img.data[idx + 1] = Math.min(255, g + band);
        img.data[idx + 2] = Math.min(255, bl + band);
        img.data[idx + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(small, 0, 0, W, H);
  }

  // ---------------------------------------------------------------- build
  private toChallengeDefinition(): ChallengeDefinition {
    const s = this.state;
    const base: ChallengeBase = s.mode === 'create'
      ? { kind: 'custom', definition: makeCustomObjectiveDefinition(s.expression, s.name || 'Custom Function', s.domain, s.description) }
      : s.base;

    return {
      schemaVersion: 1,
      id: s.challengeId,
      name: s.name || 'Custom World',
      base,
      transform: { ...s.transform },
      syntheticBasins: s.basins.map(b => ({ ...b })),
      constraints: s.constraints.map(c => ({ ...c, shape: { ...c.shape } })) as ConstraintDef[],
      noise: s.noiseOn ? { enabled: true, sigma: s.noiseSigma, seed: s.seed } : undefined,
      dynamics: s.dynOn ? {
        enabled: true, mode: s.dynMode, amplitude: s.dynAmplitude, speed: s.dynSpeed,
        depth: s.dynDepth, radius: 1.4,
        centerX: (s.domain.x1Min + s.domain.x1Max) / 2, centerZ: (s.domain.x2Min + s.domain.x2Max) / 2,
      } : undefined,
      seed: s.seed,
      metadata: { description: s.description, tags: s.mode === 'create' ? ['custom'] : ['challenge'] },
    };
  }

  private attemptBuild(): void {
    const s = this.state;

    // Validate base expression for custom definitions.
    if (s.mode === 'create' || s.base.kind === 'custom') {
      const expr = s.mode === 'create' ? s.expression : (s.base as { kind: 'custom'; definition: CustomObjectiveDefinition }).definition.expression;
      const domain = s.mode === 'create' ? s.domain : (s.base as { kind: 'custom'; definition: CustomObjectiveDefinition }).definition.domain;
      const v = validateObjective(expr, domain, 44);
      if (v.parseError) {
        this.fail(`Unable to build this world.\n\nExpression error (position ${v.parseError.position}):\n${v.parseError.message}\n\nEdit the formula and try again.`);
        return;
      }
      if (!validateDomain(domain).ok) {
        this.fail(`Unable to build this world.\n\n${validateDomain(domain).errors.join('\n')}`);
        return;
      }
      if (v.stats && v.stats.invalidFraction >= 0.995) {
        this.fail('Unable to build this world.\n\nThe objective is undefined over almost the entire selected domain. Adjust the domain.');
        return;
      }
    } else if (!validateDomain(s.domain).ok) {
      this.fail(`Unable to build this world.\n\n${validateDomain(s.domain).errors.join('\n')}`);
      return;
    }

    const def = this.toChallengeDefinition();
    try {
      this.host.buildChallenge(def);
      this.close();
    } catch (e) {
      this.fail(`Unable to build this world.\n\n${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private fail(message: string): void {
    this.setStatus(message, 'lab-status err');
  }

  // ---------------------------------------------------------------- save/export
  private saveFunction(): void {
    const s = this.state;
    const def = makeCustomObjectiveDefinition(s.expression, s.name || 'Custom Function', s.domain, s.description);
    const saved = saveCustomFunction(def, s.savedFnId);
    s.savedFnId = saved.id;
    this.setStatus('✓ Function saved to My Worlds.', 'lab-status ok');
  }

  private saveChallengeNow(): void {
    const def = this.toChallengeDefinition();
    saveChallenge(def);
    this.setStatus('✓ Challenge saved.', 'lab-status ok');
  }

  private exportJSON(): void {
    const def = this.toChallengeDefinition();
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(def.name || 'metazoo-challenge').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.setStatus('✓ Exported challenge JSON.', 'lab-status ok');
  }

  private importJSON(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const res = validateChallengeDefinition(parsed);
          if (!res.ok || !res.challenge) {
            this.setStatus(`Import failed: ${res.error ?? 'invalid file'}`, 'lab-status err');
            return;
          }
          this.state = this.blankState();
          this.state.mode = 'challenge';
          this.state.base = res.challenge.base;
          this.state.baseLabel = res.challenge.base.kind === 'builtin' ? res.challenge.base.id : res.challenge.base.definition.name;
          this.state.name = res.challenge.name;
          this.state.challengeId = res.challenge.id;
          this.state.transform = { ...res.challenge.transform };
          this.state.basins = res.challenge.syntheticBasins.map(b => ({ ...b }));
          this.state.constraints = res.challenge.constraints.map(c => ({ ...c }));
          if (res.challenge.noise) { this.state.noiseOn = true; this.state.noiseSigma = res.challenge.noise.sigma; this.state.seed = res.challenge.noise.seed; }
          if (res.challenge.dynamics) {
            this.state.dynOn = true; this.state.dynMode = res.challenge.dynamics.mode;
            this.state.dynAmplitude = res.challenge.dynamics.amplitude; this.state.dynSpeed = res.challenge.dynamics.speed;
            this.state.dynDepth = res.challenge.dynamics.depth;
          }
          if (res.challenge.base.kind === 'custom') this.state.domain = { ...res.challenge.base.definition.domain };
          else this.state.domain = defaultDomainForBuiltin(res.challenge.base.id);
          this.render();
        } catch {
          this.setStatus('Import failed: could not parse JSON.', 'lab-status err');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }
}
