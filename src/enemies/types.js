// Enemy stat table and the shared state enum. One entry per enemy kind drives AI, health and model.
import { INK } from '../render.js';

export const BOSSES = ['boss', 'eraser', 'inkblot'];
export const STATE_CODES = { spawn: 0, hunt: 1, stunned: 2, dead: 3 }; export const STATE_NAMES = ['spawn', 'hunt', 'stunned', 'dead'];
export const TYPES = {
  grunt: { hp: 100, speed: 5.2, weapon: 'rifle', range: 28, stop: 16, keep: 7, burst: 3, burstInt: 0.15, cool: [1.6, 2.6], dmg: 6, spread: 0.055, pspeed: 36, score: 100, scale: 1.0, name: 'Soldado', hat: 'cap', build: { bodyW: 1, headS: 1, limbR: 0.032 } },
  rusher: { hp: 70, speed: 7.6, weapon: 'blade', lunge: 2.9, reach: 3.0, standoff: 1.9, cool: [1.0, 1.5], dmg: 15, score: 120, scale: 0.95, name: 'Corredor', hat: 'band', build: { bodyW: 0.82, headS: 0.95, limbR: 0.027 } },
  heavy: { hp: 320, speed: 3.0, weapon: 'shotgun', range: 18, stop: 9, keep: 5, pellets: 7, cool: [2.4, 3.2], dmg: 5, spread: 0.13, pspeed: 32, score: 260, scale: 1.25, name: 'Bruto', hat: 'helmet', build: { bodyW: 1.55, headS: 0.88, limbR: 0.05 } },
  sniper: { hp: 75, speed: 4.2, weapon: 'sniper', range: 95, stop: 95, keep: 15, aimTime: 1.35, cool: [2.2, 3.2], dmg: 35, spread: 0.003, pspeed: 150, score: 200, scale: 1.05, name: 'Atirador', stationary: false, hat: 'hood', build: { bodyW: 0.78, headS: 0.92, limbR: 0.026 } },
  elitesniper: { hp: 130, speed: 5.0, weapon: 'sniper', range: 120, stop: 120, keep: 18, aimTime: 1.05, cool: [1.6, 2.5], dmg: 52, spread: 0.001, pspeed: 190, score: 350, scale: 1.15, name: 'Caçador de Precisão', stationary: false, hat: 'beret', build: { bodyW: 0.85, headS: 0.95, limbR: 0.03 } },
  shield: { hp: 150, speed: 3.8, weapon: 'pistol', range: 20, stop: 8, keep: 4, burst: 2, burstInt: 0.2, cool: [1.8, 2.6], dmg: 5, spread: 0.06, pspeed: 34, score: 200, scale: 1.05, name: 'Escudeiro', hat: 'helmet', shield: true, build: { bodyW: 1.2, headS: 0.9, limbR: 0.042 } },
  hound: { hp: 95, speed: 8.8, weapon: 'blade', lunge: 3.8, reach: 3.2, standoff: 1.6, cool: [0.8, 1.3], dmg: 18, score: 140, scale: 0.95, name: 'Lobo de Tinta', model: 'quadruped', ink: INK.BLACK },
  bat: { hp: 45, speed: 8.0, weapon: 'dive', dmg: 14, cool: [1.8, 3.0], score: 150, scale: 1.3, name: 'Morcego Voraz', flying: true, model: 'flyer', ink: INK.BLUE },
  spider: { hp: 140, speed: 7.2, weapon: 'blade', lunge: 3.4, reach: 2.8, standoff: 1.8, cool: [1.0, 1.7], dmg: 22, score: 180, scale: 1.1, name: 'Aranha Tecelã', model: 'spider', ink: INK.BLACK },
  bomber: { hp: 26, speed: 6.5, weapon: 'bomb', fuseRange: 3.4, fuse: 1.05, blast: 4.2, dmg: 24, score: 150, scale: 0.9, name: 'Bomba de Tinta', ink: INK.BLACK, model: 'bomber' },
  flyer: { hp: 40, speed: 6.2, weapon: 'dive', dmg: 10, cool: [2.8, 4.2], score: 140, scale: 1.5, name: 'Vespa de Papel', flying: true, model: 'flyer' },
  boss: { hp: 2600, speed: 3.2, weapon: 'boss', bossKind: 'doodler', range: 32, stop: 6, keep: 0, cool: [2.6, 3.6], dmg: 22, score: 2500, scale: 2.7, name: 'O Desenhista', boss: true, ink: INK.BLACK, hat: 'crown', build: { bodyW: 1.35, headS: 1.15, limbR: 0.06 } },
  eraser: { hp: 3400, speed: 4.2, weapon: 'boss', bossKind: 'eraser', range: 30, stop: 8, keep: 0, cool: [2.2, 3.2], dmg: 26, score: 3200, scale: 2.6, name: 'A Borracha', boss: true, ink: INK.PINK, model: 'blob', build: {} },
  inkblot: { hp: 3000, speed: 3.0, weapon: 'boss', bossKind: 'inkblot', range: 34, stop: 10, keep: 0, cool: [2.4, 3.4], dmg: 20, score: 3600, scale: 2.4, name: 'A Mancha de Tinta', boss: true, ink: INK.BLACK, model: 'blob', build: {} },
};
