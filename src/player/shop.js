// The in-match shop: cash, and buying weapons, armor, ammo and grenades. Mixed into Player.
import { audio } from '../audio.js';

export const SHOP_WEAPONS = {
  punisher: { cost: 500, label: 'Punisher Five-SeveN', ammoLabel: 'Munição 5.7mm Perf.' },
  deagle: { cost: 700, label: 'Desert Eagle .50', ammoLabel: 'Munição .50 AE' },
  requiem: { cost: 1600, label: 'Requiem .500 Magnum', ammoLabel: 'Munição .500 Magnum' },
  shotgun: { cost: 600, label: 'Escopeta', ammoLabel: 'Cartuchos de Escopeta' },
  smg: { cost: 750, label: 'Submetralhadora SMG', ammoLabel: 'Munição SMG' },
  rifle: { cost: 900, label: 'Rifle de Assalto', ammoLabel: 'Munição Rifle' },
  sniper: { cost: 1200, label: 'Sniper', ammoLabel: 'Munição Sniper' },
  laser: { cost: 1500, label: 'Fuzil de Plasma', ammoLabel: 'Células de Plasma' },
  bazooka: { cost: 1800, label: 'Bazuca', ammoLabel: 'Foguetes Bazuca' },
};

export const ShopMixin = {
  addCash(amount, reason = '') {
    this.money += amount;
    if (this.ctx.hud) {
      this.ctx.hud.setMoney(this.money);
      this.ctx.hud.flashMoney(amount, reason);
    }
  },
  spendCash(amount, reason = '') {
    if (this.money < amount) return false;
    this.money -= amount;
    if (this.ctx.hud) {
      this.ctx.hud.setMoney(this.money);
      this.ctx.hud.flashMoney(-amount, reason);
    }
    return true;
  },
  buyItem(key) {
    const PRICES = {
      punisher: 500,
      deagle: 700,
      requiem: 1600,
      shotgun: 600,
      smg: 750,
      rifle: 900,
      sniper: 1200,
      laser: 1500,
      bazooka: 1800,
      armor_light: 300,
      armor_heavy: 600,
      ammo: 150,
      grenades: 200,
    };
    const cost = PRICES[key];
    if (cost == null) return false;
    if (this.money < cost) {
      audio.empty();
      if (this.ctx.hud) this.ctx.hud.message('Saldo Insuficiente!', `Necessário $${cost}`, 1.2);
      return false;
    }
    const wInfo = SHOP_WEAPONS[key];
    if (wInfo) {
      const idx = this.weapons.findIndex((w) => w.kind === key);
      if (idx < 0) return false;
      const w = this.weapons[idx];
      if (w.owned) {
        w.addAmmo(w.maxReserve);
        this.spendCash(cost, wInfo.ammoLabel);
      } else {
        this.spendCash(cost, wInfo.label + ' Adquirida');
        w.owned = true;
        this.switchTo(idx);
      }
    } else if (key === 'armor_light') {
      if (this.armor >= this.maxArmor) {
        if (this.ctx.hud) this.ctx.hud.message('Colete Cheio!', 'Sua blindagem já está no máximo', 1.2);
        audio.empty();
        return false;
      }
      this.spendCash(cost, 'Colete Leve (+50)');
      this.armor = Math.min(this.maxArmor, this.armor + 50);
      if (this.ctx.hud) this.ctx.hud.setArmor(this.armor, this.maxArmor);
    } else if (key === 'armor_heavy') {
      if (this.armor >= this.maxArmor) {
        if (this.ctx.hud) this.ctx.hud.message('Colete Cheio!', 'Sua blindagem já está no máximo', 1.2);
        audio.empty();
        return false;
      }
      this.spendCash(cost, 'Colete Pesado (100)');
      this.armor = this.maxArmor;
      if (this.ctx.hud) this.ctx.hud.setArmor(this.armor, this.maxArmor);
    } else if (key === 'ammo') {
      this.spendCash(cost, 'Munição Completa');
      this.addAmmoAll(1.0);
      this.grenades = Math.min(this.maxGrenades, this.grenades + 1);
    } else if (key === 'grenades') {
      if (this.grenades >= this.maxGrenades) {
        if (this.ctx.hud) this.ctx.hud.message('Mochila Cheia!', 'Você já tem o máximo de granadas', 1.2);
        audio.empty();
        return false;
      }
      this.spendCash(cost, '+2 Granadas');
      this.grenades = Math.min(this.maxGrenades, this.grenades + 2);
    }
    audio.buy();
    return true;
  },
};
