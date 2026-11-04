// Tuning constants shared across the player's core movement and its feature mixins.
// the dome shell and anything else flagged this way cannot be hooked
export const NO_GRAPPLE = (b) => !!b.data.noGrapple;
export const STAM_FIRE = 0.09, STAM_DRAIN = 0.08, STAM_GROUND = 0.4, STAM_AIR = 0.2, STAM_MIN = 0.18, STAM_PAUSE = 0.5, PARRY_WINDOW = 0.55;
export const G = 26, WALK = 6.6, SPRINT = 10.6, CROUCH = 3.6, ACCEL = 140, FRICTION = 8, AIR_ACCEL = 36, AIR_CAP = 7.5, JUMP = 9.6;
export const STAND_H = 1.75, CROUCH_H = 1.05, EYE_STAND = 1.6, EYE_CROUCH = 0.88;
