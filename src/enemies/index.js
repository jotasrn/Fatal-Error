// Enemies: doodle humanoids (asdf-style stick figures with faces), flyers, bombers, shield bearers
// and three bosses. The stat table, model kit, projectiles and manager each live in their own
// module; this barrel re-exports the public surface the rest of the game uses.
export { TYPES, STATE_CODES, STATE_NAMES, BOSSES } from './types.js';
export { buildHumanoid, buildWeaponProp, buildBomber, buildFlyer, buildQuadruped } from './models.js';
export { EnemyManager } from './manager.js';
