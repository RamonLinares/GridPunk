/**
 * An automatic arcade wing trim, independent of circuit regulations, race
 * position and detection zones. Naming it here keeps the behavior distinct
 * from DRS or any season-specific Formula 1 system.
 */
export const STRAIGHT_LINE_AERO_MIN_SPEED = 45;
export const STRAIGHT_LINE_AERO_MAX_BRAKE = 0.05;
export const STRAIGHT_LINE_AERO_MAX_CURVATURE = 0.0016;

export function wantsStraightLineAero(curvature: number, speed: number, brake: number): boolean {
  return Math.abs(curvature) < STRAIGHT_LINE_AERO_MAX_CURVATURE
    && speed > STRAIGHT_LINE_AERO_MIN_SPEED
    && brake < STRAIGHT_LINE_AERO_MAX_BRAKE;
}
