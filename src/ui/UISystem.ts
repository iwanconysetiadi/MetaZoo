import './ui-system.css';

const paths: Record<string,string> = {
  probe:'<circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  camera:'<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>',
  layers:'<path d="m3 7 9-4 9 4-9 4zm0 5 9 4 9-4M3 17l9 4 9-4"/>',
  analysis:'<path d="M4 4v16h17M7 15l4-5 4 3 5-7"/>',
  optimum:'<path d="m12 3 2.8 6.2L21 12l-6.2 2.8L12 21l-2.8-6.2L3 12l6.2-2.8z"/>',
  atlas:'<path d="m12 2 9 10-9 10L3 12zM3 12h18M12 2v20"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
  settings:'<path d="m10 3 4 0 1 3 3 1 3-1 2 4-2 2 0 3 1 2-3 3-3-1-3 1-1 3H9l-1-3-3-1-2-3 1-3-1-3 3-2 1-3z" transform="translate(1 -1) scale(.92)"/><circle cx="12" cy="12" r="3"/>',
  present:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon:'<path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5z"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  play:'<path d="m8 4 12 8-12 8z"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  step:'<path d="m5 5 10 7-10 7zm13 0v14"/>',
  reset:'<path d="M4 9a8 8 0 1 1 1 9M4 3v6h6"/>',
  chevron:'<path d="m6 9 6 6 6-6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  save:'<path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};

export function brandLockup(): HTMLElement {
  const brand = document.createElement('div'); brand.className = 'brand'; brand.setAttribute('aria-label', 'METAZOO');
  const emblem = document.createElement('span'); emblem.className = 'brand-emblem'; emblem.setAttribute('aria-hidden', 'true');
  emblem.innerHTML = '<svg viewBox="0 0 40 40" fill="none"><path d="M6 17 13 7l10-3 11 9 2 11-10 11-13-2-9-8Z" stroke="currentColor" stroke-width="1.2" opacity=".55"/><path d="m10 18 6-8 8-1 7 7 1 8-8 7-9-2-6-6Z" stroke="currentColor" stroke-width="1.2" opacity=".75"/><path d="m13 25 1-10 6 7 7-8 1 11" stroke="#edf3ed" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round"/><circle cx="29.5" cy="9" r="2" fill="#d7bd86"/></svg>';
  const mark = document.createElement('span'); mark.className = 'mark'; mark.textContent = 'METAZOO'; brand.append(emblem, mark); return brand;
}

export function icon(name:string): HTMLSpanElement {
  const span=document.createElement('span');span.className='ui-icon';span.setAttribute('aria-hidden','true');
  span.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name]??paths.info}</svg>`;
  return span;
}

export function buttonContent(button:HTMLElement,name:string,label=''):void {
  if(button.dataset.icon===name && button.dataset.iconLabel===label && button.querySelector('svg'))return;
  button.dataset.icon=name;button.dataset.iconLabel=label;
  button.replaceChildren(icon(name));
  if(label){const text=document.createElement('span');text.className='ui-button-label';text.textContent=label;button.append(text);}
}

export function registerDialog(root:HTMLElement,close:()=>void):void {
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
  let previous:HTMLElement|null=null; let wasOpen=false;
  root.setAttribute("aria-hidden", "true");
  new MutationObserver(()=>{
    const open=root.classList.contains('open'); if(open===wasOpen)return; wasOpen=open;
    root.setAttribute('aria-hidden',String(!open));
    if(open){previous=document.activeElement as HTMLElement;requestAnimationFrame(()=>root.querySelector<HTMLElement>('[data-autofocus],button,input,textarea')?.focus());}
    else if(previous?.isConnected)previous.focus();
  }).observe(root,{attributes:true,attributeFilter:['class']});
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    if(e.key!=='Tab')return;
    const items=Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]')).filter(x=>x.getClientRects().length>0);
    const first=items[0],last=items[items.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
  });
}

let installed=false;
export function installUISystem():void {
  if(installed)return;installed=true;
  const tooltip=document.createElement('div');tooltip.className='ui-tooltip';tooltip.id='ui-tooltip';tooltip.setAttribute('role','tooltip');document.body.append(tooltip);
  let tooltipTimer=0;
  const hideTooltip=()=>{clearTimeout(tooltipTimer);tooltip.classList.remove('show');};
  const showTooltip=(target:HTMLElement)=>{
    hideTooltip();const text=target.dataset.tooltip??target.title;if(!text)return;
    tooltipTimer=window.setTimeout(()=>{
      tooltip.textContent=text;tooltip.classList.add('show');const rect=target.getBoundingClientRect();
      tooltip.style.left=`${Math.min(innerWidth-tooltip.offsetWidth-12,Math.max(12,rect.left+rect.width/2-tooltip.offsetWidth/2))}px`;
      tooltip.style.top=`${rect.bottom+tooltip.offsetHeight+12>innerHeight?rect.top-tooltip.offsetHeight-8:rect.bottom+8}px`;
    },300);
  };
  document.addEventListener('pointerover',e=>{const t=(e.target as Element).closest<HTMLElement>('[data-tooltip],[title]');if(t)showTooltip(t);});
  document.addEventListener('pointerout',hideTooltip);
  document.addEventListener('focusin',e=>{if(e.target instanceof HTMLElement)showTooltip(e.target);});
  document.addEventListener('keydown',hideTooltip);document.addEventListener('scroll',hideTooltip,true);

  let currentPopup:HTMLElement|null=null;
  const dismiss=()=>{currentPopup?.remove();currentPopup=null;document.querySelectorAll('[aria-haspopup="listbox"]').forEach(x=>x.setAttribute('aria-expanded','false'));};
  document.addEventListener('pointerdown',e=>{if(!(e.target as Element).closest('.ui-listbox,.ui-select-trigger'))dismiss();});
  document.addEventListener('metazoo:panel-open',dismiss);
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && currentPopup) { e.preventDefault(); e.stopPropagation(); dismiss(); } }, true);
  window.addEventListener('resize',dismiss);
  const enhanceSelect=(select:HTMLSelectElement)=>{
    if(select.dataset.enhanced)return;select.dataset.enhanced='true';
    const wrapper=document.createElement('div');wrapper.className='ui-select';
    if(select.style.width)wrapper.style.width=select.style.width;
    select.before(wrapper);wrapper.append(select);
    const trigger=document.createElement('button');trigger.type='button';trigger.className='ui-select-trigger';
    const label=document.createElement('span');trigger.append(label,icon('chevron'));wrapper.append(trigger);
    trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
    const name=select.getAttribute('aria-label')??select.closest('label')?.querySelector('span')?.textContent??select.parentElement?.parentElement?.querySelector('span')?.textContent??'Choose an option';
    trigger.setAttribute('aria-label',name);
    select.classList.add('ui-native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    const sync=()=>{label.textContent=select.selectedOptions[0]?.textContent??'Choose';trigger.disabled=select.disabled;};sync();select.addEventListener('change',sync);
    trigger.addEventListener('focus',sync);
    const open=()=>{
      const wasOpen=trigger.getAttribute('aria-expanded')==='true';dismiss();if(wasOpen)return;
      const list=document.createElement('div');list.className='ui-listbox';list.setAttribute('role','listbox');list.setAttribute('aria-label',name);list.id='ui-options-'+Math.random().toString(36).slice(2);
      trigger.setAttribute('aria-controls',list.id);trigger.setAttribute('aria-expanded','true');
      for(const option of Array.from(select.options)){
        const item=document.createElement('button');item.type='button';item.className='ui-option';item.textContent=option.textContent;item.disabled=option.disabled;
        item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.tabIndex=-1;
        item.addEventListener('click',()=>{select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));dismiss();trigger.focus();});list.append(item);
      }
      document.body.append(list);currentPopup=list;
      const rect=trigger.getBoundingClientRect();list.style.width=`${Math.min(360,Math.max(rect.width,160))}px`;
      list.style.left=`${Math.min(innerWidth-list.offsetWidth-12,Math.max(12,rect.left))}px`;
      const height=Math.min(list.scrollHeight,280);list.style.top=`${rect.bottom+height+10>innerHeight?Math.max(12,rect.top-height-6):rect.bottom+6}px`;
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});
    };
    trigger.addEventListener('click',open);
    trigger.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();return;}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();
      const options=Array.from(select.options).filter(x=>!x.disabled);let i=options.findIndex(x=>x.selected);
      i=e.key==='Home'?0:e.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,i+(e.key==='ArrowDown'?1:-1)));
      if(options[i]){select.value=options[i].value;select.dispatchEvent(new Event('change',{bubbles:true}));sync();dismiss();}
    });
  };
  const enhance=(root:Element)=>{
    const selects=root instanceof HTMLSelectElement?[root]:Array.from(root.querySelectorAll('select'));
    selects.forEach(enhanceSelect);
    for(const button of [root,...Array.from(root.querySelectorAll('button'))]){
      if(!(button instanceof HTMLButtonElement))continue;
      if(button.classList.contains('icon-btn')&&/^[✕×✖]$/.test(button.textContent?.trim()??'')){
        buttonContent(button,'close');button.setAttribute('aria-label','Close');button.dataset.tooltip='Close';
      }
      if(button.title&&!button.dataset.tooltip){button.dataset.tooltip=button.title;button.removeAttribute('title');}
    }
  };
  enhance(document.body);
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)enhance(node);})
    .observe(document.body,{childList:true,subtree:true});
}

/** Keep a contextual panel attached to its trigger as the viewport or panel changes. */
export function anchorPanel(panel: HTMLElement, trigger: HTMLElement): () => void {
  let frame = 0;
  const position = () => {
    frame = 0;
    if (!panel.isConnected || !trigger.isConnected) return;
    const rect = trigger.getBoundingClientRect();
    const above = rect.top > innerHeight / 2;
    const available = Math.max(80, above ? rect.top - 28 : innerHeight - rect.bottom - 28);
    const width = panel.getBoundingClientRect().width;
    const left = Math.max(16, Math.min(innerWidth - width - 16, rect.left + rect.width / 2 - width / 2));
    panel.style.left = `${left}px`; panel.style.right = 'auto'; panel.style.transform = 'none';
    panel.style.top = above ? 'auto' : `${rect.bottom + 12}px`;
    panel.style.bottom = above ? `${innerHeight - rect.top + 12}px` : 'auto';
    panel.style.maxHeight = `${available}px`;
    panel.dataset.placement = above ? 'above' : 'below';
    panel.style.setProperty('--anchor-x', `${Math.max(12, Math.min(width - 12, rect.left + rect.width / 2 - left))}px`);
    const content = panel.querySelector<HTMLElement>('.tool-panel');
    if (content) content.style.maxHeight = `${available}px`;
    const simBody = panel.querySelector<HTMLElement>('.sim-panel-body');
    if (simBody) simBody.style.maxHeight = `${Math.max(40, available - (panel.querySelector('.sim-panel-head')?.getBoundingClientRect().height ?? 48))}px`;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(position); };
  const observer = new ResizeObserver(schedule); observer.observe(panel); observer.observe(trigger);
  if (trigger.parentElement) observer.observe(trigger.parentElement);
  window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
  position();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); };
}
