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

/** Limite de conexoes P2P simultaneas na sessao Hyperswarm / LAN. */
const MAX_PEERS = 16;

/** Portas padrao da rede interna corporativa (GDFNet / LAN). */
const LAN_DISCOVERY_PORT = 41229;
const LAN_PORT_BASE = 41230;
const LAN_PORT_COUNT = 8;
const LAN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Permite conexoes diretas LAN apenas para enderecos IPv4 privados RFC1918 ou loopback,
 * impedindo SSRF contra IPs publicos da internet, link-local ou multicast.
 */
function isValidPrivateLanIp(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  if (nums.some((n) => n < 0 || n > 255)) return false;
  const [a, b, c, d] = nums;
  if (d === 0 || d === 255) {
    // Rejeita enderecos de rede/broadcast tipicos /24 como destino TCP unicast
    if (a !== 10 && !(a === 172 && b >= 16 && b <= 31)) return false;
  }
  if (a === 10) return true; // 10.0.0.0/8 (ex.: GDFNet 10.63.30.x)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 127 && b === 0 && c === 0 && d === 1) return true; // loopback de teste
  return false;
}

/**
 * Codifica IPv4 privado + offset de porta (0..7) num codigo curto de 8 letras (`G` + 7 Base32)
 * para conectar direto entre VLANs corporativas sem precisar de broadcast nem DNS/mDNS.
 */
function encodeLanCode(ip, portOffset = 0) {
  if (!isValidPrivateLanIp(ip)) return null;
  const off = Number(portOffset);
  if (!Number.isInteger(off) || off < 0 || off >= LAN_PORT_COUNT) return null;
  const [a, b, c, d] = ip.trim().split('.').map(Number);
  const ipBits = (((BigInt(a) << 24n) | (BigInt(b) << 16n) | (BigInt(c) << 8n) | BigInt(d)) << 3n) | BigInt(off);
  let out = 'G';
  for (let shift = 30n; shift >= 0n; shift -= 5n) {
    const idx = Number((ipBits >> shift) & 31n);
    out += LAN_ALPHABET[idx];
  }
  return out;
}

/**
 * Decodifica um codigo de 8 letras (`Gxxxxxxx` ou `GDF-xxxxxxx`) de volta para `{ ip, port, portOffset }`.
 */
function decodeLanCode(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().toUpperCase().replace(/^(GDF-|LAN-|G-)/, '');
  const body = clean.length === 8 && clean.startsWith('G') ? clean.slice(1) : clean.length === 7 ? clean : null;
  if (!body) return null;
  let bits = 0n;
  for (let i = 0; i < 7; i++) {
    const idx = LAN_ALPHABET.indexOf(body[i]);
    if (idx < 0) return null;
    bits = (bits << 5n) | BigInt(idx);
  }
  const portOffset = Number(bits & 7n);
  const addr = bits >> 3n;
  const a = Number((addr >> 24n) & 255n);
  const b = Number((addr >> 16n) & 255n);
  const c = Number((addr >> 8n) & 255n);
  const d = Number(addr & 255n);
  const ip = `${a}.${b}.${c}.${d}`;
  if (!isValidPrivateLanIp(ip)) return null;
  return { ip, port: LAN_PORT_BASE + portOffset, portOffset, code: 'G' + body };
}

/**
 * Aceita codigo GDFNet (`Gxxxxxxx`) ou `IP[:Porta]` privado dentro da faixa de portas do jogo.
 */
function parseLanTarget(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const decoded = decodeLanCode(trimmed);
  if (decoded) return decoded;

  const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{4,5}))?$/.exec(trimmed);
  if (!m) return null;
  const ip = m[1];
  if (!isValidPrivateLanIp(ip)) return null;
  const port = m[2] ? Number(m[2]) : LAN_PORT_BASE;
  if (!Number.isInteger(port) || port < LAN_PORT_BASE || port >= LAN_PORT_BASE + LAN_PORT_COUNT) {
    return null;
  }
  const portOffset = port - LAN_PORT_BASE;
  return { ip, port, portOffset, code: encodeLanCode(ip, portOffset) };
}

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
    if (process.platform === 'win32') {
      return actual.pathname.toLowerCase() === expected.pathname.toLowerCase();
    }
    return actual.pathname === expected.pathname;
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
  LAN_DISCOVERY_PORT,
  LAN_PORT_BASE,
  LAN_PORT_COUNT,
  frame,
  makeDecoder,
  isValidLobbyCode,
  isValidPeerKey,
  isValidPrivateLanIp,
  encodeLanCode,
  decodeLanCode,
  parseLanTarget,
  sanitizeLog,
  isAllowedExternalUrl,
  isTrustedAppUrl,
  filterSafeGpuFlags,
  PeerRateLimiter,
};

