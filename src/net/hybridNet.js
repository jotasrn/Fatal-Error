import { JOIN_TIMEOUT } from './constants.js';

export class GdfHybridNet {
  constructor(lan, peer) {
    this.lan = lan;
    this.peer = peer;
    this.activeClient = null; // No modo cliente, guarda qual sub-driver venceu ('lan' | 'peer')
    this.isHost = false;
    this._inMatch = false;
    this._accepting = true;
    this._hostName = '';
    this._isPublic = true;
    this._maxPlayers = 10;

    if (this.lan && this.peer) {
      this.lan.extraCountFn = () => (this.isHost && this.peer.active ? this.peer.conns.size : 0);
      this.peer.extraCountFn = () => (this.isHost && this.lan.active ? this.lan.conns.size : 0);

      // Ponte cruzada no Host: pacotes relay/direct de um cliente TCP chegam aos clientes WebRTC e vice-versa!
      this.lan.on('__forward_direct', ({ to, packet }) => {
        if (this.isHost && this.peer.active) {
          const c = this.peer.conns.get(to);
          if (c && c.open) c.send(packet);
        }
      });
      this.lan.on('__forward_relay', ({ packet }) => {
        if (this.isHost && this.peer.active) {
          for (const c of this.peer.conns.values()) if (c.open) c.send(packet);
        }
      });
      this.peer.on('__forward_direct', ({ to, packet }) => {
        if (this.isHost && this.lan.active) {
          const w = this.lan.conns.get(to);
          if (w) w.send(packet);
        }
      });
      this.peer.on('__forward_relay', ({ packet }) => {
        if (this.isHost && this.lan.active) {
          for (const w of this.lan.conns.values()) w.send(packet);
        }
      });
    }
  }

  get active() {
    if (this.isHost) return (this.lan && this.lan.active) || this.peer.active;
    return this.activeClient ? this.activeClient.active : false;
  }
  get conns() {
    if (this.isHost) {
      const merged = new Map();
      if (this.lan && this.lan.active) for (const [k, v] of this.lan.conns) merged.set(k, v);
      if (this.peer.active) for (const [k, v] of this.peer.conns) merged.set(k, v);
      return merged;
    }
    return this.activeClient ? this.activeClient.conns : new Map();
  }
  get peerIds() { return [...this.conns.keys()]; }
  get id() {
    if (this.isHost) return (this.lan && this.lan.active) ? this.lan.id : this.peer.effectiveId;
    return this.activeClient ? this.activeClient.id : null;
  }
  get code() {
    if (this.isHost) return (this.lan && this.lan.active) ? this.lan.code : this.peer.code;
    return this.activeClient ? this.activeClient.code : null;
  }
  get hostId() {
    if (this.isHost) return this.id;
    return this.activeClient ? this.activeClient.hostId : null;
  }
  get lanAddress() {
    return (this.isHost && this.lan && this.lan.active) ? this.lan.lanAddress : null;
  }
  get aliasCode() {
    return this.peer.aliasCode || null;
  }
  get isPublic() { return this._isPublic; }
  set isPublic(v) {
    this._isPublic = !!v;
    if (this.lan) { this.lan.isPublic = !!v; this.lan._syncMeta(); }
    this.peer.isPublic = !!v;
  }
  get inMatch() { return this._inMatch; }
  set inMatch(v) {
    this._inMatch = !!v;
    if (this.lan) { this.lan.inMatch = !!v; this.lan._syncMeta(); }
    this.peer.inMatch = !!v;
  }
  get accepting() { return this._accepting; }
  set accepting(v) {
    this._accepting = !!v;
    if (this.lan) { this.lan.accepting = !!v; this.lan._syncMeta(); }
    this.peer.accepting = !!v;
  }
  get maxPlayers() { return this._maxPlayers; }
  set maxPlayers(v) {
    this._maxPlayers = v;
    if (this.lan) { this.lan.maxPlayers = v; this.lan._syncMeta(); }
    this.peer.maxPlayers = v;
  }
  get hostName() { return this._hostName; }
  set hostName(v) {
    this._hostName = v;
    if (this.lan) { this.lan.hostName = v; this.lan._syncMeta(); }
    this.peer.hostName = v;
  }

  async host(opts = {}) {
    await this.leave();
    this.isHost = true;
    this._isPublic = opts.isPublic !== false;

    if (this.lan) {
      this.lan.hostName = this._hostName;
      const lanCode = await this.lan.host({ isPublic: this._isPublic });
      // Abre tambem o espelho WebRTC local (PeerJS sem STUN/TURN externos) em paralelo:
      // se o firewall da maquina bloquear TCP 41230 de entrada, o colega entra pelo WebRTC UDP!
      this.peer.hostName = this._hostName;
      this.peer.host({
        isPublic: false,
        isInternal: true,
        publishDir: true,
        code: opts.code || lanCode,
        logicalId: this.lan.id,
      }).catch(() => {
        /* sem internet / PeerJS bloqueado: LanNet TCP + UDP Discovery seguem operando normalmente */
      });
      return opts.code || lanCode;
    }

    this.peer.hostName = this._hostName;
    return await this.peer.host({
      isPublic: false,
      isInternal: true,
      publishDir: true,
      code: opts.code || null,
    });
  }

  async join(code, meta = {}) {
    await this.leave();
    this.isHost = false;
    const raw = String(code || '').trim();
    if (!raw) throw new Error('enter a lobby code');

    let lanErr = null;
    if (this.lan) {
      try {
        const joinedCode = await this.lan.join(raw, meta, 1900);
        this.activeClient = this.lan;
        return joinedCode;
      } catch (err) {
        lanErr = err;
      }
    }

    // Se for apenas IP puro (ex.: 10.63.30.10) e o TCP falhou, nao ha codigo PeerJS correspondente
    if (/^\d{1,3}(\.\d{1,3}){3}(:\d{2,5})?$/.test(raw)) {
      throw lanErr || new Error('no answer from that lobby');
    }

    const joinedPeerCode = await this.peer.join(raw, { ...meta, isInternal: true, mode: 'lan' });
    this.activeClient = this.peer;
    return joinedPeerCode;
  }

  async quickJoin(meta = {}, onStatus = null) {
    await this.leave();
    this.isHost = false;
    if (this.lan) {
      if (onStatus) onStatus('Buscando salas na rede local…');
      const localRooms = await this.lan.discover(500);
      const openRoom = localRooms.find((r) => !r.full);
      if (openRoom) {
        try {
          const c = await this.lan.join(openRoom.code, meta, 1900);
          this.activeClient = this.lan;
          return c;
        } catch {
          /* tenta WebRTC abaixo */
        }
      }
    }
    const c = await this.peer.quickJoin({ ...meta, isInternal: true, mode: 'lan' }, onStatus);
    this.activeClient = this.peer;
    return c;
  }

  claimAlias(code, tries) {
    this.peer.claimAlias(code, tries);
  }

  async leave() {
    this.activeClient = null;
    this.isHost = false;
    this.peer.leave();
    if (this.lan) await this.lan.leave();
  }

  send(type, data, relay = false) {
    if (this.isHost) {
      if (this.lan && this.lan.active) this.lan.send(type, data, relay);
      if (this.peer.active) this.peer.send(type, data, relay);
    } else if (this.activeClient) {
      this.activeClient.send(type, data, relay);
    }
  }

  broadcast(type, data) { this.send(type, data, true); }

  sendTo(pid, type, data) {
    if (this.isHost) {
      if (this.lan && this.lan.active && this.lan.sendTo(pid, type, data)) return;
      if (this.peer.active) this.peer.sendTo(pid, type, data);
    } else if (this.activeClient) {
      this.activeClient.sendTo(pid, type, data);
    }
  }
}

// ---- DualNet: orquestra Global P2P (Hyperswarm) e Rede Interna Corporativa ----
