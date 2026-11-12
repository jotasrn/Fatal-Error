// Meta-progressão permanente entre partidas: moedas ("Créditos Candangos" 💎), desbloqueio de armas
// iniciais, melhorias do gancho, skins de armas e cores/adestramento para o cão Orelha.
import { INK } from '../render.js';

const STORAGE_KEY = 'fatal_prog_v1';

export const PROG_ITEMS = {
  // Armas iniciais (já começa toda partida com ela no inventário)
  start_shotgun: { cat: 'weapons', name: 'Escopeta Inicial', desc: 'Comece todas as partidas já com a Escopeta no Slot 2.', cost: 140 },
  start_smg: { cat: 'weapons', name: 'SMG Inicial', desc: 'Comece todas as partidas já com a Submetralhadora no Slot 3.', cost: 190 },
  start_rifle: { cat: 'weapons', name: 'Rifle Inicial', desc: 'Comece todas as partidas já com o Rifle de Assalto no Slot 4.', cost: 260 },
  start_sniper: { cat: 'weapons', name: 'Sniper Inicial', desc: 'Comece todas as partidas já com o Rifle de Precisão no Slot 5.', cost: 340 },

  // Upgrades permanentes do Gancho (3 níveis cada)
  grapple_range: { cat: 'grapple', name: 'Cabo de Aço Estendido', desc: '+22% de alcance máximo do gancho por nível (ideal para atravessar o Eixo e pegar ônibus).', maxLv: 3, costs: [100, 180, 280] },
  grapple_speed: { cat: 'grapple', name: 'Polia Motorizada', desc: '+22% de velocidade ao puxar a corda do gancho por nível.', maxLv: 3, costs: [100, 180, 280] },
  grapple_stam: { cat: 'grapple', name: 'Fôlego Candango', desc: '-20% consumo de fôlego no gancho e +25% recarga por nível.', maxLv: 3, costs: [100, 180, 280] },

  // Adestramento e cores para o cão Orelha
  orelha_bite: { cat: 'orelha', name: 'Adestramento de Combate', desc: 'Orelha causa +35% de dano na mordida, corre mais rápido e atordoa inimigos por mais tempo.', maxLv: 3, costs: [90, 170, 260] },
  orelha_caramelo: { cat: 'orelha_skin', name: 'Vira-Lata Caramelo', desc: 'O clássico guardião caramelo das paradas de ônibus de Brasília.', cost: 0, ink: INK.ORANGE },
  orelha_preto: { cat: 'orelha_skin', name: 'Pretinho da Rodoviária', desc: 'Pelagem escura nanquim com coleira vermelha.', cost: 110, ink: INK.BLACK },
  orelha_azul: { cat: 'orelha_skin', name: 'Azulado da UnB', desc: 'Pelagem azul celeste estilizada.', cost: 140, ink: INK.BLUE },
  orelha_verde: { cat: 'orelha_skin', name: 'Guardião do Parque', desc: 'Pelagem verde cerrado.', cost: 160, ink: INK.GREEN },
  orelha_rosa: { cat: 'orelha_skin', name: 'Caramelo Cyber Rosa', desc: 'Pelagem rosa neon vibrante do Conic.', cost: 210, ink: INK.PINK },

  // Skins de arma do jogador
  skin_default: { cat: 'skin', name: 'Nanquim Clássico', desc: 'Acabamento tradicional desenhado à caneta.', cost: 0, ink: null },
  skin_gold: { cat: 'skin', name: 'Ouro do Planalto', desc: 'Acabamento dourado/âmbar em todas as armas.', cost: 160, ink: INK.ORANGE },
  skin_cobalt: { cat: 'skin', name: 'Azul Niemeyer', desc: 'Acabamento azul vitral da Catedral.', cost: 180, ink: INK.BLUE },
  skin_emerald: { cat: 'skin', name: 'Esmeralda Esplanada', desc: 'Acabamento verde dos ministérios.', cost: 180, ink: INK.GREEN },
  skin_neon: { cat: 'skin', name: 'Neon Conjunto Nacional', desc: 'Acabamento rosa choque luminoso.', cost: 220, ink: INK.PINK },
  skin_crimson: { cat: 'skin', name: 'Rubi Alvorada', desc: 'Acabamento vermelho carmesim.', cost: 250, ink: INK.RED },
};

function defaultState() {
  return {
    credits: 120, // começa com um bônus inicial para experimentar a loja de progressão
    totalEarned: 120,
    missionsDone: 0,
    unlocked: {
      orelha_caramelo: true,
      skin_default: true,
    },
    levels: {
      grapple_range: 0,
      grapple_speed: 0,
      grapple_stam: 0,
      orelha_bite: 0,
    },
    equipped: {
      orelhaSkin: 'orelha_caramelo',
      weaponSkin: 'skin_default',
    },
  };
}

class ProgressionManager {
  constructor() {
    this.data = defaultState();
    this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (typeof parsed.credits === 'number' && Number.isFinite(parsed.credits)) this.data.credits = Math.max(0, Math.floor(parsed.credits));
      if (typeof parsed.totalEarned === 'number' && Number.isFinite(parsed.totalEarned)) this.data.totalEarned = Math.max(0, Math.floor(parsed.totalEarned));
      if (typeof parsed.missionsDone === 'number' && Number.isFinite(parsed.missionsDone)) this.data.missionsDone = Math.max(0, Math.floor(parsed.missionsDone));
      if (parsed.unlocked && typeof parsed.unlocked === 'object') {
        for (const k of Object.keys(PROG_ITEMS)) {
          if (parsed.unlocked[k]) this.data.unlocked[k] = true;
        }
      }
      if (parsed.levels && typeof parsed.levels === 'object') {
        for (const k of ['grapple_range', 'grapple_speed', 'grapple_stam', 'orelha_bite']) {
          const maxLv = PROG_ITEMS[k].maxLv || 3;
          const v = Number(parsed.levels[k] || 0);
          if (Number.isFinite(v)) this.data.levels[k] = Math.max(0, Math.min(maxLv, Math.floor(v)));
        }
      }
      if (parsed.equipped && typeof parsed.equipped === 'object') {
        if (PROG_ITEMS[parsed.equipped.orelhaSkin] && this.data.unlocked[parsed.equipped.orelhaSkin]) {
          this.data.equipped.orelhaSkin = parsed.equipped.orelhaSkin;
        }
        if (PROG_ITEMS[parsed.equipped.weaponSkin] && this.data.unlocked[parsed.equipped.weaponSkin]) {
          this.data.equipped.weaponSkin = parsed.equipped.weaponSkin;
        }
      }
    } catch (e) { /* ignore storage errors */ }
  }
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) { /* ignore */ }
  }
  get credits() { return this.data.credits; }
  addCredits(amount, _reason = '') {
    const n = Math.max(0, Math.round(amount || 0));
    if (n <= 0) return 0;
    this.data.credits += n;
    this.data.totalEarned += n;
    this.save();
    return n;
  }
  recordMissionDone() {
    this.data.missionsDone = (this.data.missionsDone || 0) + 1;
    this.save();
  }
  levelOf(key) {
    return this.data.levels[key] || 0;
  }
  isUnlocked(key) {
    return !!this.data.unlocked[key];
  }
  buyOrEquip(key) {
    const item = PROG_ITEMS[key];
    if (!item) return { ok: false, msg: 'Item inválido' };
    if (item.maxLv) {
      const lv = this.levelOf(key);
      if (lv >= item.maxLv) return { ok: false, msg: 'Nível máximo atingido' };
      const cost = item.costs[lv];
      if (this.data.credits < cost) return { ok: false, msg: `Créditos insuficientes (${cost} CR)` };
      this.data.credits -= cost;
      this.data.levels[key] = lv + 1;
      this.save();
      return { ok: true, upgraded: true, level: lv + 1, msg: `${item.name} Nv.${lv + 1}!` };
    }
    if (this.isUnlocked(key)) {
      if (item.cat === 'orelha_skin') {
        this.data.equipped.orelhaSkin = key;
        this.save();
        return { ok: true, equipped: true, msg: `Equipado: ${item.name}` };
      }
      if (item.cat === 'skin') {
        this.data.equipped.weaponSkin = key;
        this.save();
        return { ok: true, equipped: true, msg: `Skin equipada: ${item.name}` };
      }
      return { ok: false, msg: 'Já desbloqueado' };
    }
    if (this.data.credits < item.cost) return { ok: false, msg: `Créditos insuficientes (${item.cost} CR)` };
    this.data.credits -= item.cost;
    this.data.unlocked[key] = true;
    if (item.cat === 'orelha_skin') this.data.equipped.orelhaSkin = key;
    if (item.cat === 'skin') this.data.equipped.weaponSkin = key;
    this.save();
    return { ok: true, bought: true, msg: `Desbloqueado: ${item.name}!` };
  }
  // Multiplicadores aplicados em tempo real no jogador e no Orelha
  get grappleRangeMul() { return 1 + 0.22 * this.levelOf('grapple_range'); }
  get grappleSpeedMul() { return 1 + 0.22 * this.levelOf('grapple_speed'); }
  get grappleStamDrainMul() { return Math.max(0.35, 1 - 0.20 * this.levelOf('grapple_stam')); }
  get grappleStamRegenMul() { return 1 + 0.25 * this.levelOf('grapple_stam'); }
  get orelhaBiteMul() { return 1 + 0.35 * this.levelOf('orelha_bite'); }
  get orelhaInk() {
    const sk = PROG_ITEMS[this.data.equipped.orelhaSkin];
    return sk && sk.ink != null ? sk.ink : INK.ORANGE;
  }
  get weaponInk() {
    const sk = PROG_ITEMS[this.data.equipped.weaponSkin];
    return sk ? sk.ink : null;
  }
  applyToPlayer(player) {
    if (!player || !player.weapons) return;
    if (this.isUnlocked('start_shotgun') && player.weapons[1]) player.weapons[1].owned = true;
    if (this.isUnlocked('start_smg') && player.weapons[2]) player.weapons[2].owned = true;
    if (this.isUnlocked('start_rifle') && player.weapons[3]) player.weapons[3].owned = true;
    if (this.isUnlocked('start_sniper') && player.weapons[4]) player.weapons[4].owned = true;
    const wInk = this.weaponInk;
    for (const w of player.weapons) {
      if (!w || !w.root) continue;
      w.root.traverse((o) => {
        if (o.isMesh && o.material && o.material.uniforms && o.material.uniforms.uInk) {
          if (o.userData.origInk === undefined) o.userData.origInk = o.material.uniforms.uInk.value;
          o.material.uniforms.uInk.value = wInk != null ? wInk : o.userData.origInk;
        }
      });
    }
  }
  applyToOrelha(e) {
    if (!e || !e.T || !e.T.isPet || !e.mat || !e.mat.uniforms || !e.mat.uniforms.uInk) return;
    e.mat.uniforms.uInk.value = this.orelhaInk;
  }
}

export const progression = new ProgressionManager();

