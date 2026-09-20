export type NeonVehicle = 'k89' | 'shinsei';

/** Explicit links win over the saved garage choice. */
export function selectedNeonVehicle(): NeonVehicle {
  const query = new URLSearchParams(location.search).get('car');
  if (query === 'k89' || query === 'shinsei') return query;
  try {
    const saved = localStorage.getItem('gridpunk:neon-car');
    if (saved === 'k89' || saved === 'shinsei') return saved;
  } catch { /* Storage can be unavailable in private browsing. */ }
  return 'shinsei';
}
