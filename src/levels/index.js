// Level registry. Each map builds with the shared builder (./builder.js); buildLevel picks one.
import { createBuilder } from './builder.js';
import { buildBrasilia } from './brasilia.js';
import { buildClockTower } from './clocktower.js';
import { buildPeak } from './peak.js';
import { buildDesk } from './desk.js';

export const LEVELS = [
  { key: 'brasilia', name: 'Brasília · Eixo Monumental', blurb: 'Plano Piloto com o traçado real: Eixão, Rodoviária, Esplanada, Asas Norte e Sul' },
  { key: 'clocktower', name: 'Torre do Relógio', blurb: 'Pátio gótico · Torre do relógio com sino e campanário' },
  { key: 'peak', name: 'Pico', blurb: 'Prédios em níveis · Telhados, passarelas e tiro de longe' },
  { key: 'desk', name: 'Arena Tática', blurb: 'Combate intenso em curta distância e verticalidade extrema' },
];

export function buildLevel(scene, world, key = 'brasilia', opts = {}) {
  const B = createBuilder(scene, world);
  if (key === 'clocktower') return buildClockTower(B, !!opts.arena);
  if (key === 'peak') return buildPeak(B, !!opts.arena);
  if (key === 'desk') return buildDesk(B, !!opts.arena);
  return buildBrasilia(B, !!opts.arena);
}
