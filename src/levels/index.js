// Level registry. Each map builds with the shared builder (./builder.js); buildLevel picks one.
import { createBuilder } from './builder.js';
import { buildDistrict } from './district.js';
import { buildMexico } from './mexico.js';
import { buildDesk } from './desk.js';

// Doodle Mexico is built and kept, but off the menu until it is ready; flip this to offer it again
export const MEXICO_READY = true;
export const LEVELS = [
  { key: 'district', name: 'Distrito Doodle', blurb: 'Ruas, telhados e escadas de incêndio' },
  { key: 'mexico', name: 'Doodle México', blurb: 'Praça ensolarada · Piñatas, tacos e mariachis' },
  { key: 'desk', name: 'Mesa de Estudos', blurb: 'Mesa escolar · Pilhas de livros, réguas, borrachas e lápis' }
];

export function buildLevel(scene, world, key = 'district', opts = {}) {
  const B = createBuilder(scene, world);
  if (key === 'mexico') return buildMexico(B, !!opts.arena);
  if (key === 'desk') return buildDesk(B, !!opts.arena);
  return buildDistrict(B, !!opts.arena);
}
