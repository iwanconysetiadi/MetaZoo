/** Invertible presentation mapping: domain coordinates stay authoritative. */
export function islandEdgeRadius(angle: number): number {
  return 1.46 + .20 * Math.sin(angle * 3 + .45)
    + .13 * Math.sin(angle * 5 - 1.1) + .055 * Math.sin(angle * 7 + .8)
    + .08 * Math.cos(angle - .8);
}

export function squareToIsland(s: number, t: number): { x: number; z: number } {
  const length = Math.hypot(s,t);
  if (length < 1e-14) return {x:0,z:0};
  const radius = Math.max(Math.abs(s),Math.abs(t));
  const scale = radius * islandEdgeRadius(Math.atan2(t,s)) / length;
  return {x:s*scale,z:t*scale};
}

export function islandToSquare(x: number, z: number): { s: number; t: number } {
  const length = Math.hypot(x,z);
  if (length < 1e-14) return {s:0,t:0};
  const scale = length / (islandEdgeRadius(Math.atan2(z,x)) * Math.max(Math.abs(x),Math.abs(z)));
  return {s:x*scale,t:z*scale};
}
