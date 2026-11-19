// Rede hibrida P2P do Fatal Error:
// 1. Modo Global (SwarmNet): Hyperswarm DHT + Noise Ed25519 + UDP hole-punching (sem servidor).
// 2. Modo Rede Interna / Corporativa (GdfHybridNet = LanNet TCP/UDP + PeerNet WebRTC LAN):
//    - Prioriza conexao TCP direta na rede local (10.x.x.x / 192.168.x.x) + descoberta UDP na sub-rede,
//      funcionando 100% offline e entre VLANs pelo codigo de 8 letras (`Gxxxxxxx`) ou IP direto.
//    - Se o Firewall de Dominio do Windows bloquear porta TCP de entrada na maquina do Host,
//      faz fallback automatico imediato para WebRTC ICE direto por IP local (sem mDNS .local e sem
//      depender de servidores STUN/TURN externos bloqueados pelo proxy corporativo).

import { makeCode, isLikelyLanCode, peerAvailable } from './constants.js';
import { PeerNet } from './peerNet.js';
import { SwarmNet, LanNet } from './bridgeNet.js';
import { GdfHybridNet } from './hybridNet.js';

export { makeCode, isLikelyLanCode };

export class DualNet {
  constructor() {
    this.swarm = (typeof window !== 'undefined' && window.FE_NET) ? new SwarmNet() : null;
    this.lan = (typeof window !== 'undefined' && window.FE_LAN) ? new LanNet() : null;
    this.peer = new PeerNet();
    this.gdf = new GdfHybridNet(this.lan, this.peer);
    this.driver = this.swarm || this.gdf;
    this.mode = this.swarm ? 'swarm' : 'gdf';
    this.isInternal = !this.swarm;
  }

  usePeer(isLan = true) {
    this.isInternal = !!isLan;
    if (isLan || !this.swarm) {
      this.driver = this.gdf;
      this.mode = 'gdf';
    } else {
      this.driver = this.swarm;
      this.mode = 'swarm';
    }
    return this.driver;
  }

  get active() { return this.driver.active; }
  get peerIds() { return this.driver.peerIds; }
  get conns() { return this.driver.conns || new Map(); }
  get id() { return this.driver.id; }
  get code() { return this.driver.code; }
  get hostId() { return this.driver.hostId; }
  get isHost() { return this.driver.isHost; }
  get lanAddress() { return this.driver.lanAddress || null; }
  get isPublic() { return this.driver.isPublic; }
  set isPublic(v) { this.gdf.isPublic = v; if (this.swarm) this.swarm.isPublic = v; }
  get inMatch() { return this.driver.inMatch; }
  set inMatch(v) { this.gdf.inMatch = v; if (this.swarm) this.swarm.inMatch = v; }
  get accepting() { return this.driver.accepting; }
  set accepting(v) { this.gdf.accepting = v; if (this.swarm) this.swarm.accepting = v; }
  get maxPlayers() { return this.driver.maxPlayers; }
  set maxPlayers(v) { this.gdf.maxPlayers = v; if (this.swarm) this.swarm.maxPlayers = v; }
  get hostName() { return this.driver.hostName; }
  set hostName(v) { this.gdf.hostName = v; if (this.swarm) this.swarm.hostName = v; }
  get aliasCode() { return this.driver.aliasCode; }

  set onPeerJoin(fn) {
    this.peer.onPeerJoin = fn;
    if (this.lan) this.lan.onPeerJoin = fn;
    if (this.swarm) this.swarm.onPeerJoin = fn;
  }
  set onPeerLeave(fn) {
    this.peer.onPeerLeave = fn;
    if (this.lan) this.lan.onPeerLeave = fn;
    if (this.swarm) this.swarm.onPeerLeave = fn;
  }
  set onDisconnect(fn) {
    this.peer.onDisconnect = fn;
    if (this.lan) this.lan.onDisconnect = fn;
    if (this.swarm) this.swarm.onDisconnect = fn;
  }
  set onAlias(fn) {
    this.peer.onAlias = fn;
    if (this.lan) this.lan.onAlias = fn;
    if (this.swarm) this.swarm.onAlias = fn;
  }

  on(type, fn) {
    this.peer.on(type, fn);
    if (this.lan) this.lan.on(type, fn);
    if (this.swarm) this.swarm.on(type, fn);
  }

  send(type, data, relay = false) { return this.driver.send(type, data, relay); }
  broadcast(type, data) { return this.driver.broadcast(type, data); }
  sendTo(pid, type, data) { return this.driver.sendTo(pid, type, data); }

  async host(opts = {}) {
    if (opts.mode === 'lan' || opts.isInternal) {
      this.usePeer(true);
      return await this.gdf.host({ ...opts, isPublic: true });
    }
    this.usePeer(false);
    return await this.driver.host(opts);
  }

  async join(code, meta = {}) {
    const raw = String(code || '').trim().toUpperCase();
    if (meta.mode === 'lan' || meta.isInternal || isLikelyLanCode(raw)) {
      this.usePeer(true);
      return await this.gdf.join(raw, meta);
    }

    // Se houver sala local com esse mesmo codigo na sub-rede, conecta instantaneamente
    if (this.lan) {
      const localRooms = await this.lan.discover(320);
      if (localRooms.some((r) => r.code.toUpperCase() === raw)) {
        this.usePeer(true);
        return await this.gdf.join(raw, meta);
      }
    }

    this.usePeer(false);
    try {
      return await this.driver.join(raw, meta);
    } catch (err) {
      if (this.driver !== this.gdf) {
        this.usePeer(true);
        return await this.gdf.join(raw, meta);
      }
      throw err;
    }
  }

  async quickJoin(meta = {}, onStatus = null) {
    if (this.lan) {
      const localRooms = await this.lan.discover(400);
      if (localRooms.some((r) => !r.full)) {
        this.usePeer(true);
        return await this.gdf.quickJoin(meta, onStatus);
      }
    }
    if (meta.mode === 'lan' || meta.isInternal || !this.swarm) {
      this.usePeer(true);
      return await this.gdf.quickJoin(meta, onStatus);
    }
    this.usePeer(false);
    return await this.driver.quickJoin(meta, onStatus);
  }

  async listLobbies(meta = {}, onStatus = null) {
    const [lanRooms, peerRooms] = await Promise.all([
      this.lan ? this.lan.discover(450) : Promise.resolve([]),
      this.peer.listLobbies(meta, onStatus).catch(() => []),
    ]);
    const byCode = new Map();
    for (const r of [...lanRooms, ...peerRooms]) {
      const k = String(r.code || '').replace(/-\d+$/, '');
      if (!k) continue;
      const prev = byCode.get(k);
      if (!prev || (r.isLan && !prev.isLan) || (r.players || 0) > (prev.players || 0)) {
        byCode.set(k, { ...r, code: k });
      }
    }
    return [...byCode.values()].sort((a, b) => (b.players || 0) - (a.players || 0));
  }

  claimAlias(code, tries) {
    if (this.driver.claimAlias) this.driver.claimAlias(code, tries);
  }

  async leave() {
    await this.gdf.leave();
    if (this.swarm) await this.swarm.leave();
  }
}

export const Net = DualNet;
