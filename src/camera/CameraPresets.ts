export const CAMERA_PRESETS: Array<{ id: string; name: string; description: string }> = [
  { id: 'overview', name: 'Overview', description: 'Framed overview of the whole landscape' },
  { id: 'orbit', name: 'Orbit', description: 'Free orbital exploration around the landscape' },
  { id: 'top-down', name: 'Top-Down', description: 'Scientific contour view from above' },
  { id: 'valley-view', name: 'Valley View', description: 'Low-angle view along dominant valley' },
  { id: 'minimum-focus', name: 'Minimum Focus', description: 'Focus on global optimum' },
  { id: 'saddle-focus', name: 'Saddle Focus', description: 'Focus on selected saddle point' },
  { id: 'cross-section', name: 'Cross-Section', description: 'Align with current slice plane' },
  { id: 'cinematic', name: 'Cinematic Survey', description: 'Slow automated inspection' },
];

export const PRESET_SHORTCUTS: Record<string, string> = {
  '1': 'orbit',
  '2': 'top-down',
  '3': 'valley-view',
  '4': 'minimum-focus',
  '5': 'saddle-focus',
  '6': 'cross-section',
  '7': 'cinematic',
};