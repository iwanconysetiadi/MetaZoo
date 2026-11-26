export const CAMERA_PRESETS: Array<{ id: string; name: string; description: string }> = [
  { id: 'overview', name: 'World Overview', description: 'Framed view of the whole floating world' },
  { id: 'orbit', name: 'Orbit', description: 'Free orbital exploration around the landscape' },
  { id: 'top-down', name: 'Top-Down', description: 'Scientific contour view from above' },
  { id: 'low-flyover', name: 'Low Flyover', description: 'Glide along the island edge and reveal its depth' },
  { id: 'valley-view', name: 'Valley View', description: 'Low-angle view along dominant valley' },
  { id: 'minimum-focus', name: 'Optimum Focus', description: 'Focus on the exact global optimum' },
  { id: 'saddle-focus', name: 'Saddle Focus', description: 'Focus on selected saddle point' },
  { id: 'cross-section', name: 'Cross-Section', description: 'Align with current slice plane' },
  { id: 'cinematic', name: 'Cinematic Orbit', description: 'Slow automated inspection' },
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
