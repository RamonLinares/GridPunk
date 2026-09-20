/** Authored features for the fictional city course; fractions follow arc length. */
export const NEON_BANKS = [
  {start: .095, end: .155, ramp: .016, gradient: .24},
  {start: .565, end: .625, ramp: .016, gradient: .30},
] as const;
export const NEON_TUNNEL = {start: .305, end: .393, clearance: 7.2, halfWidth: 12.55} as const;
const ease = (x:number) => { const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t); };
export function neonBankAt(p:number):number {
  return NEON_BANKS.reduce((angle,b)=>angle+Math.atan(b.gradient)*ease((p-b.start)/b.ramp)*ease((b.end-p)/b.ramp),0);
}
// Pivot about the low barrier, keeping all road/shoulder vertices above the city floor.
export const neonRoadLiftAt = (p:number) => 12.4*Math.sin(neonBankAt(p));
export const neonTunnelAt = (p:number) => p>=NEON_TUNNEL.start && p<=NEON_TUNNEL.end;
// Outside-only weather; reach silence at the mouth, recover after the exit.
export function neonRainExposure(p:number,length:number):number {
  if(neonTunnelAt(p))return 0;
  return p<NEON_TUNNEL.start?ease((NEON_TUNNEL.start-p)*length/18):ease((p-NEON_TUNNEL.end)*length/18);
}
