import {
  PREFIX, LEGACY_PREFIX, PUBLIC_SLOTS, GDF_PUBLIC_SLOTS,
  JOIN_TIMEOUT, QUICK_TIMEOUT, isLikelyLanCode, idFromError,
} from './constants.js';

export const PeerDiscoveryMixin = {
  async join(code, meta = {}) {
    this.leave();
    this.isHost = false;
    this.isInternal = !!(meta.isInternal || meta.mode === 'lan' || isLikelyLanCode(code));
    code = String(code || '').trim().toUpperCase().replace(/^(GDF-|LAN-)/, '');
    if (!code) throw new Error('enter a lobby code');

    this.peer = await this._newPeer(null, this.isInternal);
    this.id = this.peer.id;
    this._keepAlive(this.peer);

    const base = code.replace(/-\d+$/, '');
    const variants = [code, ...['-1', '-2', '-3'].map((suf) => base + suf).filter((c) => c !== code)];
    const ids = [];
    for (const v of variants) {
      ids.push(PREFIX + v);
      if (v.length <= 7) ids.push(LEGACY_PREFIX + v);
    }

    let res;
    try {
      res = await this._knockAny(ids, meta, JOIN_TIMEOUT);
    } catch (e) {
      this.leave();
      throw e;
    }
    const { hostId, conn, welcome, earlyMsgs } = res;
    this._adopt(hostId, conn, welcome, earlyMsgs);
    this.code = (welcome && welcome.code) || hostId.replace(/^[^-]+-/, '');
    return this.code;
  },

  async quickJoin(meta = {}, onStatus = null) {
    this.leave();
    this.isHost = false;
    this.isInternal = !!(meta.isInternal || meta.mode === 'lan');
    this.peer = await this._newPeer(null, this.isInternal);
    this.id = this.peer.id;
    this._keepAlive(this.peer);
    if (onStatus) onStatus('Procurando salas abertas…');

    const ids = [];
    for (let i = 0; i < GDF_PUBLIC_SLOTS; i++) ids.push(PREFIX + 'GDFPUB' + i);
    for (let i = 0; i < PUBLIC_SLOTS; i++) for (const suf of ['', '-1', '-2']) ids.push(PREFIX + 'PUB' + i + suf);

    const winner = await new Promise((resolve) => {
      let pending = ids.length, done = false;
      const attempts = [], offers = [];
      let gather = null;
      const pick = () => {
        if (!offers.length) return null;
        offers.sort((a, b) => (b.welcome.players || 0) - (a.welcome.players || 0));
        return offers[0];
      };
      const settle = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(gather);
        this.peer.off('error', onErr);
        const val = pick();
        for (const a of attempts) {
          if (!val || a.conn !== val.conn) {
            try { a.conn.close(); } catch { /* ignore */ }
          }
        }
        resolve(val);
      };
      const failOne = (a) => {
        if (a.done) return;
        a.done = true;
        pending--;
        if (pending <= 0) settle();
      };
      const onErr = (err) => {
        if (err && err.type === 'peer-unavailable') {
          const a = attempts.find((x) => x.hostId === idFromError(err));
          if (a) failOne(a);
        }
      };
      this.peer.on('error', onErr);
      const timer = setTimeout(settle, QUICK_TIMEOUT);
      const probeMeta = { ...meta, probe: true };
      for (const hostId of ids) {
        let conn;
        try { conn = this.peer.connect(hostId, { reliable: true, serialization: 'json', metadata: probeMeta }); }
        catch { pending--; continue; }
        const a = { conn, hostId, done: false, earlyMsgs: [] };
        attempts.push(a);
        const onData = (msg) => {
          if (!msg) return;
          if (!a.done) {
            if (msg.t === 'welcome') {
              a.done = true;
              pending--;
              offers.push({ conn, hostId, welcome: msg.d, earlyMsgs: a.earlyMsgs, onData });
              if (onStatus) onStatus(`Encontradas ${offers.length} salas abertas…`);
              if (pending <= 0) settle();
              else if (!gather) gather = setTimeout(settle, 1200);
            } else if (msg.t === 'refused') {
              failOne(a);
            }
          } else {
            a.earlyMsgs.push(msg);
          }
        };
        conn.on('data', onData);
        conn.on('error', () => failOne(a));
        conn.on('close', () => failOne(a));
      }
      if (pending <= 0) settle();
    });

    if (!winner) {
      this.leave();
      throw new Error('no open public lobbies');
    }
    winner.conn.off('data', winner.onData);
    winner.conn.send({ t: 'stay' });
    this._adopt(winner.hostId, winner.conn, winner.welcome, winner.earlyMsgs);
    this.code = (winner.welcome && winner.welcome.code) || winner.hostId.slice(PREFIX.length);
    return this.code;
  },

  async listLobbies(meta = {}, onStatus = null) {
    if (this.active) throw new Error('leave the lobby first');
    const peer = await this._newPeer(null, true);
    const ids = [];
    for (let i = 0; i < GDF_PUBLIC_SLOTS; i++) ids.push(PREFIX + 'GDFPUB' + i);
    for (let i = 0; i < PUBLIC_SLOTS; i++) ids.push(PREFIX + 'PUB' + i);

    const found = await new Promise((resolve) => {
      let pending = ids.length, done = false;
      const attempts = [], offers = [];
      let gather = null;
      const settle = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(gather);
        peer.off('error', onErr);
        for (const a of attempts) {
          try { a.conn.close(); } catch { /* ignore */ }
        }
        resolve(offers);
      };
      const failOne = (a) => {
        if (a.done) return;
        a.done = true;
        pending--;
        if (pending <= 0) settle();
      };
      const onErr = (err) => {
        if (err && err.type === 'peer-unavailable') {
          const a = attempts.find((x) => x.hostId === idFromError(err));
          if (a) failOne(a);
        }
      };
      peer.on('error', onErr);
      const timer = setTimeout(settle, QUICK_TIMEOUT);
      const probeMeta = { ...meta, probe: true };
      for (const hostId of ids) {
        let conn;
        try { conn = peer.connect(hostId, { reliable: true, serialization: 'json', metadata: probeMeta }); }
        catch { pending--; continue; }
        const a = { conn, hostId, done: false };
        attempts.push(a);
        conn.on('data', (msg) => {
          if (!msg || a.done) return;
          if (msg.t === 'welcome' || msg.t === 'refused') {
            a.done = true;
            pending--;
            const d = msg.d || {};
            const isLanSlot = hostId.includes('GDFPUB') || !!d.isLan;
            offers.push({
              id: d.code || hostId.slice(PREFIX.length),
              code: d.code || hostId.slice(PREFIX.length),
              players: d.players || 0,
              max: d.max || 10,
              inMatch: !!d.inMatch,
              hostName: d.hostName || '',
              full: msg.t === 'refused',
              isLan: isLanSlot,
            });
            if (onStatus) onStatus(`Encontradas ${offers.length} salas…`);
            if (pending <= 0) settle();
            else if (!gather) gather = setTimeout(settle, 1500);
          }
        });
        conn.on('error', () => failOne(a));
        conn.on('close', () => failOne(a));
      }
      if (pending <= 0) settle();
    });

    try { peer.destroy(); } catch { /* ignore */ }
    const byCode = new Map();
    for (const o of found) {
      const k = String(o.code || '').replace(/-\d+$/, '');
      const prev = byCode.get(k);
      if (!prev || o.players > prev.players) byCode.set(k, { ...o, code: k });
    }
    return [...byCode.values()].sort((a, b) => b.players - a.players);
  },

  _knockAny(ids, meta, timeoutMs) {
    return new Promise((resolve, reject) => {
      let pending = ids.length, done = false, lastErr = null;
      const attempts = [];
      const finish = (err, val) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.peer.off('error', onErr);
        for (const a of attempts) {
          if (!val || a.conn !== val.conn) {
            try { a.conn.close(); } catch { /* ignore */ }
          } else if (a.onData) {
            a.conn.off('data', a.onData);
          }
        }
        if (val) resolve(val);
        else reject(err || new Error('no lobby with that code'));
      };
      const failOne = (a, err) => {
        if (a.done) return;
        a.done = true;
        if (err && !/no lobby/.test(String(err.message))) lastErr = err;
        pending--;
        if (pending <= 0) finish(lastErr || new Error('no lobby with that code'));
      };
      const onErr = (err) => {
        if (err && err.type === 'peer-unavailable') {
          const a = attempts.find((x) => x.hostId === idFromError(err));
          if (a) failOne(a, new Error('no lobby with that code'));
        }
      };
      this.peer.on('error', onErr);
      const timer = setTimeout(() => finish(new Error('no answer from that lobby')), timeoutMs);

      for (const hostId of ids) {
        let conn;
        try { conn = this.peer.connect(hostId, { reliable: true, serialization: 'json', metadata: meta }); }
        catch { pending--; continue; }
        const a = { conn, hostId, done: false, welcomed: false, earlyMsgs: [], onData: null };
        attempts.push(a);
        a.onData = (msg) => {
          if (!msg) return;
          if (!a.welcomed) {
            if (msg.t === 'welcome') {
              a.welcomed = true;
              a.done = true;
              finish(null, { hostId, conn, welcome: msg.d, earlyMsgs: a.earlyMsgs });
            } else if (msg.t === 'refused') {
              failOne(a, new Error(msg.d && msg.d.reason || 'the lobby turned you away'));
            }
          } else {
            a.earlyMsgs.push(msg);
          }
        };
        conn.on('data', a.onData);
        conn.on('error', (e) => failOne(a, e instanceof Error ? e : new Error('could not connect')));
        conn.on('close', () => failOne(a, null));
      }
      if (pending <= 0) finish(lastErr || new Error('no lobby with that code'));
    });
  },

  _adopt(transportHostId, conn, welcome, earlyMsgs = []) {
    this._transportHostId = transportHostId;
    this.hostId = (welcome && welcome.hostId) || transportHostId;
    this.conns.set(transportHostId, conn);
    this.connected = true;
    this.isPublic = !!(welcome && welcome.isPublic);
    this.isInternal = !!(welcome && welcome.isLan) || this.isInternal;
    this._wire(conn);
    for (const m of earlyMsgs) {
      if (m && typeof m === 'object') this._route(m, transportHostId);
    }
  }
};
