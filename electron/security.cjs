'use strict';
/**
 * Camada de seguranca do processo principal (modelo Concord).
 *
 * Centraliza validacao de IPC, framing P2P com limite estrito de memoria,
 * protecao contra prototype pollution, rate-limiting por chave publica Noise
 * e lista branca de flags de GPU / URLs externas para que tudo seja testavel
 * em CI fora do Electron.
 */
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** Limite maximo de um quadro JSON P2P (256 KB — pacotes reais tem < 8 KB). */
const MAX_FRAME_BYTES = 256 * 1024;

/** Limite de conexoes P2P simultaneas na sessao Hyperswarm. */
const MAX_PEERS = 16;

/** Chaves proibidas em JSON vindo da rede para impedir prototype pollution. */
const FORBIDDEN_JSON_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function safeJsonParse(raw) {
  return JSON.parse(raw, (key, value) => (FORBIDDEN_JSON_KEYS.has(key) ? undefined : value));
}

function isPlainMessage(msg) {
  return (
    msg !== null &&
    typeof msg === 'object' &&
    !Array.isArray(msg) &&
    typeof msg.t === 'string' &&
    msg.t.length > 0 &&
    msg.t.length <= 32
  );
}

/**
 * Empacota um objeto em frame length-prefixed (4 bytes BE + UTF-8).
 * Recusa payloads acima de MAX_FRAME_BYTES antes de enviar na rede.
 */
function frame(obj) {
  if (!isPlainMessage(obj)) {
    throw new TypeError('Mensagem P2P invalida para envio');
  }
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  if (body.length === 0 || body.length > MAX_FRAME_BYTES) {
    throw new RangeError(`Frame P2P fora do limite (${body.length} bytes)`);
  }
  const head = Buffer.allocUnsafe(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

/**
 * Decodificador streaming com protecao contra DoS de memoria e JSON malformado.
 * Ao detectar cabecalho invalido ou JSON hostil, dispara `onProtocolError` e
 * trava permanentemente o decoder para que o socket seja encerrado.
 */
function makeDecoder(onMessage, onProtocolError = null) {
  let buf = Buffer.alloc(0);
  let aborted = false;

  const fail = (reason) => {
    aborted = true;
    buf = Buffer.alloc(0);
    if (onProtocolError) onProtocolError(new Error(reason));
  };

  return (chunk) => {
    if (aborted) return;
    if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
    if (chunk.length === 0) return;

    if (buf.length + chunk.length > MAX_FRAME_BYTES * 2 + 8) {
      fail('Buffer de recepcao excedeu limite de seguranca');
      return;
    }

    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 4 && !aborted) {
      const len = buf.readUInt32BE(0);
      if (len === 0 || len > MAX_FRAME_BYTES) {
        fail(`Tamanho de frame invalido: ${len}`);
        return;
      }
      if (buf.length < 4 + len) break;
      const body = buf.subarray(4, 4 + len);
      buf = buf.subarray(4 + len);
      let msg;
      try {
        msg = safeJsonParse(body.toString('utf8'));
      } catch {
        fail('JSON malformado no stream P2P');
        return;
      }
      if (!isPlainMessage(msg)) {
        fail('Envelope P2P fora do contrato');
        return;
      }
      onMessage(msg);
    }
  };
}

/** Valida codigo de sala (3 a 16 caracteres alfanumericos ou hifen de migracao). */
function isValidLobbyCode(code) {
  if (typeof code !== 'string') return false;
  const trimmed = code.trim().toUpperCase();
  return /^[A-Z0-9-]{3,16}$/.test(trimmed);
}

/** Valida chave publica Ed25519 do Hyperswarm/Noise (64 hex chars = 32 bytes). */
function isValidPeerKey(key) {
  return typeof key === 'string' && /^[0-9a-f]{64}$/i.test(key);
}

/** Remove caracteres de controle e quebras de linha para evitar log injection. */
function sanitizeLog(input, maxLen = 2000) {
  return String(input ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLen);
}

/** Permite abrir no navegador do sistema apenas links http(s) validos. */
function isAllowedExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Confirma que um evento IPC ou navegacao veio do nosso proprio index.html local,
 * bloqueando iframes ou paginas externas caso alguma tentasse chamar o preload.
 */
function isTrustedAppUrl(rawUrl, appHtmlPath) {
  if (typeof rawUrl !== 'string' || !rawUrl.startsWith('file:')) return false;
  try {
    const actual = new URL(rawUrl);
    const expected = pathToFileURL(path.resolve(appHtmlPath));
    return actual.pathname.toLowerCase() === expected.pathname.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Lista branca estrita de switches seguros em <userData>/gpu-flags.txt.
 * Bloqueia flags perigosas de execucao/depuracao (--no-sandbox, --gpu-launcher,
 * --renderer-cmd-prefix, --inspect, --js-flags, --load-extension, etc.).
 */
const SAFE_BOOL_GPU_SWITCHES = new Set([
  'ignore-gpu-blocklist',
  'enable-gpu-rasterization',
  'enable-zero-copy',
  'disable-gpu-vsync',
  'disable-frame-rate-limit',
  'disable-gpu-driver-bug-workarounds',
]);

const SAFE_VALUE_GPU_SWITCHES = new Map([
  ['use-angle', /^(d3d11|d3d11on12|gl|gles|vulkan|default)$/],
  ['enable-features', /^[A-Za-z0-9_,:-]{1,120}$/],
  ['disable-features', /^[A-Za-z0-9_,:-]{1,120}$/],
]);

function filterSafeGpuFlags(rawText) {
  const accepted = [];
  if (typeof rawText !== 'string') return accepted;
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const clean = line.replace(/^--+/, '');
    const eq = clean.indexOf('=');
    if (eq < 0) {
      if (SAFE_BOOL_GPU_SWITCHES.has(clean)) {
        accepted.push({ name: clean, value: null });
      }
    } else {
      const name = clean.slice(0, eq);
      const value = clean.slice(eq + 1);
      const pattern = SAFE_VALUE_GPU_SWITCHES.get(name);
      if (pattern && pattern.test(value)) {
        accepted.push({ name, value });
      }
    }
  }
  return accepted;
}

/**
 * Token-bucket por peer para conter floods de pacotes no topico publico do DHT.
 */
class PeerRateLimiter {
  constructor({ ratePerSec = 140, burst = 220, maxStrikes = 30 } = {}) {
    this.ratePerSec = ratePerSec;
    this.burst = burst;
    this.maxStrikes = maxStrikes;
    this.buckets = new Map();
  }

  allow(key, nowMs = Date.now()) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.burst, lastMs: nowMs, strikes: 0 };
      this.buckets.set(key, b);
    }
    const elapsedSec = Math.max(0, (nowMs - b.lastMs) / 1000);
    b.lastMs = nowMs;
    b.tokens = Math.min(this.burst, b.tokens + elapsedSec * this.ratePerSec);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true, kick: false };
    }
    b.strikes += 1;
    return { allowed: false, kick: b.strikes >= this.maxStrikes };
  }

  delete(key) {
    this.buckets.delete(key);
  }

  clear() {
    this.buckets.clear();
  }
}

module.exports = {
  MAX_FRAME_BYTES,
  MAX_PEERS,
  frame,
  makeDecoder,
  isValidLobbyCode,
  isValidPeerKey,
  sanitizeLog,
  isAllowedExternalUrl,
  isTrustedAppUrl,
  filterSafeGpuFlags,
  PeerRateLimiter,
};

