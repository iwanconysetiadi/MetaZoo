/** Presentation tokens shared by scene materials and CSS (via applyVisualTokens). */
export const VISUAL = {
  skyDeep: '#5c7f9d', skyMid: '#88a9bc', skyLight: '#b7cdd7', horizon: '#dce4e2',
  cloudLight: '#faf7f0', cloudWarm: '#f2ebdd', cloudCool: '#d7e1e5', cloudShadow: '#bccdd6',
  terrainLow: '#164b32', terrainMoist: '#2c6446', terrainGrass: '#48744d', terrainDry: '#65775a',
  rockDeep: '#394446', rockMid: '#4d5857', rockLight: '#70766f',
  uiBg: 'rgba(14,25,34,.65)', uiBgSoft: 'rgba(20,34,44,.60)', uiBorder: 'rgba(230,238,236,.12)',
  textPrimary: '#edf2ee', textSecondary: '#a8b5b7', textMuted: '#7e9095',
  jade: '#78b8a4', jadeSoft: '#92c8b6', gold: '#c5a56a', goldSoft: '#d6bd88', danger: '#c98273',
};

export const ENVIRONMENT_QUALITY = {
  performance: { near: 8, mid: 16, distant: 10, highGroups: 2, grass: 2500, shadow: 512, dpr: 1, islands: 2 },
  balanced: { near: 18, mid: 30, distant: 18, highGroups: 4, grass: 7000, shadow: 1024, dpr: 1.5, islands: 4 },
  presentation: { near: 26, mid: 45, distant: 28, highGroups: 5, grass: 14000, shadow: 2048, dpr: 2, islands: 5 },
  ultra: { near: 26, mid: 45, distant: 28, highGroups: 5, grass: 18000, shadow: 2048, dpr: 2, islands: 5 },
};

export function applyVisualTokens(): void {
  for (const [key, value] of Object.entries(VISUAL)) {
    document.documentElement.style.setProperty(`--mz-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`, value);
  }
}
