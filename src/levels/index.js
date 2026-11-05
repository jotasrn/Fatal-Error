// Level registry. Each map builds with the shared builder (./builder.js); buildLevel picks one.
import { createBuilder } from './builder.js';
import { buildDistrict } from './district.js';
import { buildMexico } from './mexico.js';
import { buildDesk } from './desk.js';
import { buildClockTower } from './clocktower.js';
import { buildPeak } from './peak.js';
import { buildBrasilia } from './brasilia.js';

// Doodle Mexico is built and kept, but off the menu until it is ready; flip this to offer it again
export const MEXICO_READY = true;
export const LEVELS = [
  { key: 'district', name: 'Distrito Doodle', blurb: 'Ruas, telhados e escadas de incêndio' },
  { key: 'brasilia', name: 'Brasília · Eixo Monumental', blurb: 'Mané Garrincha, Torre de TV, Ulysses, Pátio Brasil, Conjunto Nacional e Esplanada' },
  { key: 'mexico', name: 'Doodle México', blurb: 'Praça ensolarada · Piñatas, tacos e mariachis' },
  { key: 'desk', name: 'Mesa de Estudos', blurb: 'Mesa escolar · Pilhas de livros, réguas, borrachas e lápis' },
  { key: 'clocktower', name: 'Torre do Relógio', blurb: 'Pátio gótico · Torre do relógio com sino e campanário' },
  { key: 'peak', name: 'Pico', blurb: 'Prédios em níveis · Telhados, passarelas e tiro de longe' }
];

export function buildLevel(scene, world, key = 'district', opts = {}) {
  const B = createBuilder(scene, world);
  if (key === 'brasilia') return buildBrasilia(B, !!opts.arena);
  if (key === 'mexico') return buildMexico(B, !!opts.arena);
  if (key === 'desk') return buildDesk(B, !!opts.arena);
  if (key === 'clocktower') return buildClockTower(B, !!opts.arena);
  if (key === 'peak') return buildPeak(B, !!opts.arena);
  return buildDistrict(B, !!opts.arena);
}
