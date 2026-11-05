import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  escHtml,
  sanitizeName,
  sanitizeText,
  clampNum,
  sanitizeVec3,
  sanitizeShots,
  authorizeClientPacketOnHost,
  authorizePacketOnClient,
} from '../src/security.js';

const require = createRequire(import.meta.url);
const {
  MAX_FRAME_BYTES,
  frame,
  makeDecoder,
  isValidLobbyCode,
  isValidPeerKey,
  sanitizeLog,
  isAllowedExternalUrl,
  isTrustedAppUrl,
  filterSafeGpuFlags,
  PeerRateLimiter,
} = require('../electron/security.cjs');

test('framing P2P: round-trip de pacotes fragmentados e multiplos por chunk', () => {
  const received = [];
  const errors = [];
  const decode = makeDecoder(
    (m) => received.push(m),
    (e) => errors.push(e),
  );

  const f1 = frame({ t: 'ps', d: { p: [10, 2, -30] } });
  const f2 = frame({ t: 'shots', d: { k: 'rifle', e: [1, 2, 3] } });
  const combined = Buffer.concat([f1, f2]);

  decode(combined.subarray(0, 7));
  decode(combined.subarray(7));

  assert.equal(errors.length, 0);
  assert.equal(received.length, 2);
  assert.deepEqual(received[0], { t: 'ps', d: { p: [10, 2, -30] } });
  assert.deepEqual(received[1], { t: 'shots', d: { k: 'rifle', e: [1, 2, 3] } });
});

test('framing P2P: bloqueia cabecalho gigante (DoS de memoria) e trava decoder', () => {
  const received = [];
  const errors = [];
  const decode = makeDecoder(
    (m) => received.push(m),
    (e) => errors.push(e),
  );

  const hostileHeader = Buffer.alloc(8);
  hostileHeader.writeUInt32BE(MAX_FRAME_BYTES + 1, 0);
  decode(hostileHeader);
  // Mesmo que envie um frame valido depois, o decoder ja abortou o socket hostil.
  decode(frame({ t: 'ps', d: {} }));

  assert.equal(received.length, 0);
  assert.equal(errors.length, 1);
});

test('framing P2P: neutraliza tentativa de prototype pollution no JSON', () => {
  const received = [];
  const decode = makeDecoder((m) => received.push(m));
  const rawBody = Buffer.from(
    '{"t":"hello","d":{"name":"Evil","__proto__":{"polluted":true},"constructor":{"prototype":{"hacked":true}}}}',
    'utf8',
  );
  const head = Buffer.alloc(4);
  head.writeUInt32BE(rawBody.length, 0);
  decode(Buffer.concat([head, rawBody]));

  assert.equal(received.length, 1);
  assert.equal(({}).polluted, undefined);
  assert.equal(({}).hacked, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(received[0].d, '__proto__'), false);
});

test('PeerRateLimiter: contem flood de pacotes e sinaliza kick apos strikes', () => {
  const limiter = new PeerRateLimiter({ ratePerSec: 10, burst: 5, maxStrikes: 3 });
  const peer = 'a'.repeat(64);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(limiter.allow(peer, 1000), { allowed: true, kick: false });
  }
  assert.deepEqual(limiter.allow(peer, 1000), { allowed: false, kick: false });
  assert.deepEqual(limiter.allow(peer, 1000), { allowed: false, kick: false });
  assert.deepEqual(limiter.allow(peer, 1000), { allowed: false, kick: true });
});

test('validadores de IPC, URL externa e log injection', () => {
  assert.equal(isValidLobbyCode('ABC23'), true);
  assert.equal(isValidLobbyCode('PUBLIC-1'), true);
  assert.equal(isValidLobbyCode('AB'), false);
  assert.equal(isValidLobbyCode('SALA;RM -RF'), false);

  assert.equal(isValidPeerKey('0123456789abcdef'.repeat(4)), true);
  assert.equal(isValidPeerKey('012345'), false);
  assert.equal(isValidPeerKey('g'.repeat(64)), false);

  const injected = sanitizeLog('erro normal\r\n[2026-01-01] FAKE ADMIN\x00\x07');
  assert.equal(injected.includes('\n'), false);
  assert.equal(injected.includes('\r'), false);
  assert.equal(injected.includes('\x00'), false);

  assert.equal(isAllowedExternalUrl('https://github.com/jotasrn/Fatal-Error'), true);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedExternalUrl('file:///C:/Windows/System32/cmd.exe'), false);
  assert.equal(isAllowedExternalUrl('ms-msdt:/id PCWDiagnostic'), false);

  const appHtml = path.resolve('index.html');
  const fileUrl = new URL('file:///' + appHtml.replace(/\\/g, '/')).href;
  assert.equal(isTrustedAppUrl(fileUrl, appHtml), true);
  assert.equal(isTrustedAppUrl('https://evil.example/index.html', appHtml), false);
});

test('filterSafeGpuFlags: aceita apenas switches seguros de video e barra execucao de comandos', () => {
  const flags = filterSafeGpuFlags(`
    # comentario
    --disable-frame-rate-limit
    use-angle=d3d11
    --no-sandbox
    --gpu-launcher=calc.exe
    --renderer-cmd-prefix=powershell.exe
    --remote-debugging-port=9222
    --js-flags=--expose-gc
    use-angle= D3D11;calc
  `);
  assert.deepEqual(flags, [
    { name: 'disable-frame-rate-limit', value: null },
    { name: 'use-angle', value: 'd3d11' },
  ]);
});

test('XSS e sanitizacao de nomes/vetores/tracers no protocolo do jogo', () => {
  const xssName = '<img src=x onerror="alert(1)">';
  const escaped = escHtml(xssName);
  assert.equal(escaped.includes('<'), false);
  assert.equal(escaped.includes('>'), false);
  assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');

  assert.equal(sanitizeName('  João\u202E\x00\x1F  '), 'João');
  assert.equal(sanitizeName('   ', 'Padrao'), 'Padrao');

  assert.equal(clampNum(NaN, 0, 220, 0), 0);
  assert.equal(clampNum(Infinity, 0, 220, 0), 0);
  assert.equal(clampNum(999999, 0, 220, 0), 220);

  assert.deepEqual(sanitizeVec3([10, 20, -30]), [10, 20, -30]);
  assert.equal(sanitizeVec3([10, NaN, 0]), null);
  assert.equal(sanitizeVec3([999999, 0, 0]), null);

  // Limita array gigante de tiros a 36 coordenadas (12 raios)
  const hugeShots = Array.from({ length: 300 }, (_, i) => i % 50);
  assert.equal(sanitizeShots(hugeShots, 36).length, 36);
});

test('anti-spoofing e autoridade do Host no protocolo multiplayer', () => {
  const hostId = 'host-key';
  const attackerId = 'peer-attacker';
  const victimId = 'peer-victim';

  // 1. Cliente tentando forjar evento exclusivo do Host (kick, end, score, ekillcredit)
  for (const forbidden of ['kick', 'end', 'score', 'ekillcredit', 'lobby', 'start', 'esnap']) {
    const res = authorizeClientPacketOnHost(
      { t: forbidden, d: { reason: 'hacked' }, to: victimId, relay: true, from: hostId },
      attackerId,
      hostId,
    );
    assert.equal(res.action, 'drop', `Tipo ${forbidden} deveria ser bloqueado no Host`);
  }

  // 2. Cliente tentando falsificar `from` num pacote de dano (pdmg) para incriminar outro jogador
  const pdmg = authorizeClientPacketOnHost(
    { t: 'pdmg', to: victimId, from: 'innocent-player', d: { amount: 50, by: 'innocent-player' } },
    attackerId,
    hostId,
  );
  assert.equal(pdmg.action, 'direct');
  assert.equal(pdmg.to, victimId);
  assert.equal(pdmg.packet.from, attackerId); // Sobrescrito com a chave autenticada!

  // 3. Cliente recebendo pacote de peer que NAO e o Host: bloqueado imediatamente
  const rogue = authorizePacketOnClient({ t: 'end', d: { id: attackerId }, from: hostId }, attackerId, hostId);
  assert.equal(rogue.allowed, false);

  // 4. Pacote HOST_ONLY chegando pelo canal do Host mas com `from` de outro cliente: bloqueado
  const spoofedRelay = authorizePacketOnClient({ t: 'score', d: [], from: attackerId }, hostId, hostId);
  assert.equal(spoofedRelay.allowed, false);

  // 5. Pacote legitimo do Host (score) e relay legitimo (ps) passam normalmente
  assert.deepEqual(authorizePacketOnClient({ t: 'score', d: [], from: hostId }, hostId, hostId), {
    allowed: true,
    from: hostId,
  });
  assert.deepEqual(authorizePacketOnClient({ t: 'ps', d: {}, from: attackerId }, hostId, hostId), {
    allowed: true,
    from: attackerId,
  });
});

