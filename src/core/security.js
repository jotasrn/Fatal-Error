// Regras de seguranca do protocolo de jogo e sanitizacao de UI (renderer + testes Node).
// Impede XSS no placar/lobby, spoofing de remetente/autoridade de host e corrupcao por NaN/Infinity.

const HTML_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa qualquer string vinda de outro jogador antes de interpolar em HTML. */
export function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_MAP[ch]);
}

/** Remove caracteres de controle e overrides bidirecionais Unicode. */
export function sanitizeText(value, maxLen = 120) {
  return String(value ?? '')
    .replace(/[\x00-\x1F\x7F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .trim()
    .slice(0, maxLen);
}

/** Sanitiza apelido de jogador (ate 14 caracteres limpos). */
export function sanitizeName(value, fallback = 'Jogador') {
  const clean = sanitizeText(value, 14);
  return clean || fallback;
}

/** Garante numero finito limitado a [min, max]; devolve fallback se NaN/Infinity/tipo errado. */
export function clampNum(value, min, max, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** Valida vetor 3D [x, y, z] finito dentro dos limites do mundo. */
export function sanitizeVec3(arr, maxAbs = 2500) {
  if (!Array.isArray(arr) || arr.length < 3) return null;
  const x = Number(arr[0]);
  const y = Number(arr[1]);
  const z = Number(arr[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (Math.abs(x) > maxAbs || Math.abs(y) > maxAbs || Math.abs(z) > maxAbs) return null;
  return [x, y, z];
}

/**
 * Valida o estado compacto do jogador enviado em 'ps' (ver encodeLocal em players.js):
 * [x, y, z, yaw, pitch, arma, flags, hp, vx, vy, vz, (gx, gy, gz do gancho)].
 * Devolve uma copia limpa ou null. (O pacote e um array, nao um objeto com `p`.)
 */
export function sanitizePlayerState(d, maxAbs = 2500) {
  if (!Array.isArray(d) || d.length < 8 || d.length > 16) return null;
  for (const v of d) if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (!sanitizeVec3(d, maxAbs)) return null;
  if (d.length >= 14 && !sanitizeVec3(d.slice(11, 14), maxAbs)) return null;
  const out = d.slice();
  out[3] = clampNum(out[3], -1e4, 1e4, 0);
  out[4] = clampNum(out[4], -Math.PI, Math.PI, 0);
  out[5] = Math.round(clampNum(out[5], 0, 31, 0));
  out[6] = Math.round(clampNum(out[6], 0, 0xffff, 0));
  out[7] = clampNum(out[7], -100, 1000, 0);
  for (let i = 8; i < Math.min(out.length, 11); i++) out[i] = clampNum(out[i], -200, 200, 0);
  return out;
}

/** Limita lista de coordenadas de tracers (shots.e) a no maximo 12 raios (36 floats) finitos. */
export function sanitizeShots(arr, maxCoords = 36, maxAbs = 2500) {
  if (!Array.isArray(arr) || arr.length < 3) return [];
  const limit = Math.min(arr.length - (arr.length % 3), maxCoords);
  const out = [];
  for (let i = 0; i < limit; i += 3) {
    const v = sanitizeVec3([arr[i], arr[i + 1], arr[i + 2]], maxAbs);
    if (v) out.push(v[0], v[1], v[2]);
  }
  return out;
}

/**
 * Mensagens exclusivas de autoridade do Host.
 * - Clientes NUNCA podem originar/repassar estes tipos pelo Host.
 * - Clientes SO aceitam estes tipos quando `from === hostId`.
 */
export const HOST_ONLY_TYPES = new Set([
  'welcome',
  'refused',
  'lobby',
  'start',
  'end',
  'backtolobby',
  'score',
  'clock',
  'espawn',
  'esnap',
  'ekill',
  'ekillcredit',
  'ewave',
  'ewaveclear',
  'pickup',
  'taken',
  'bmanif',
  'bcalm',
  'briot',
  'bwanted',
  'bevent',
  'kick',
  'leave',
  'feed',
]);

/** Mensagens que um cliente envia somente para o Host processar. */
export const CLIENT_TO_HOST_TYPES = new Set([
  'hello',
  'stay',
  'startreq',
  'take',
  'ehit',
  'fell',
]);

/** Mensagens que um cliente pode pedir ao Host para retransmitir (relay) a sala. */
export const CLIENT_RELAY_TYPES = new Set([
  'ps',
  'shots',
  'nade',
  'rocket',
  'brk',
  'pdead',
]);

/** Mensagens ponto-a-ponto encaminhadas pelo Host com `from` carimbado pelo transporte. */
export const CLIENT_DIRECT_TYPES = new Set([
  'pdmg',
  'parry',
  'cut',
]);

/**
 * Avalia um pacote recebido pelo Host vindo de um cliente autenticado (`peerId`).
 * Carimba `from = peerId` (impedindo spoofing de identidade) e bloqueia tipos proibidos.
 * Retorna `{ action: 'drop' | 'direct' | 'relay' | 'local', packet }`.
 */
export function authorizeClientPacketOnHost(msg, peerId, hostId) {
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') {
    return { action: 'drop', packet: null };
  }
  const t = msg.t;
  if (HOST_ONLY_TYPES.has(t)) {
    return { action: 'drop', packet: null };
  }

  const stamped = { t, d: msg.d, from: peerId };

  if (msg.to) {
    if (typeof msg.to !== 'string' || !CLIENT_DIRECT_TYPES.has(t)) {
      return { action: 'drop', packet: null };
    }
    if (msg.to === hostId) {
      return { action: 'local', packet: stamped };
    }
    return { action: 'direct', to: msg.to, packet: stamped };
  }

  if (msg.relay) {
    if (!CLIENT_RELAY_TYPES.has(t)) {
      return { action: 'drop', packet: null };
    }
    return { action: 'relay', packet: stamped };
  }

  if (CLIENT_TO_HOST_TYPES.has(t) || CLIENT_RELAY_TYPES.has(t)) {
    return { action: 'local', packet: stamped };
  }

  return { action: 'drop', packet: null };
}

/**
 * Avalia um pacote recebido por um Cliente vindo da conexao com o Host.
 * Garante que mensagens HOST_ONLY so sejam aceitas quando `effectiveFrom === hostId`.
 */
export function authorizePacketOnClient(msg, senderPeerId, hostId) {
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') {
    return { allowed: false, from: null };
  }
  if (!hostId || senderPeerId !== hostId) {
    return { allowed: false, from: null };
  }
  const effectiveFrom = typeof msg.from === 'string' && msg.from.length <= 128 ? msg.from : senderPeerId;
  if (HOST_ONLY_TYPES.has(msg.t) && effectiveFrom !== hostId) {
    return { allowed: false, from: null };
  }
  return { allowed: true, from: effectiveFrom };
}

