// The in-match shop: cash, and buying weapons, armor, ammo and grenades. Mixed into Player.
import { audio } from '../audio.js';

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
      shotgun: 600,
      rifle: 900,
      sniper: 1200,
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
    if (key === 'shotgun') {
      if (this.weapons[1].owned) {
        this.weapons[1].addAmmo(this.weapons[1].maxReserve);
        this.spendCash(cost, 'Munição Escopeta');
      } else {
        this.spendCash(cost, 'Escopeta Adquirida');
        this.weapons[1].owned = true;
        this.switchTo(1);
      }
    } else if (key === 'rifle') {
      if (this.weapons[2].owned) {
        this.weapons[2].addAmmo(this.weapons[2].maxReserve);
        this.spendCash(cost, 'Munição Rifle');
      } else {
        this.spendCash(cost, 'Rifle Adquirido');
        this.weapons[2].owned = true;
        this.switchTo(2);
      }
    } else if (key === 'sniper') {
      if (this.weapons[3].owned) {
        this.weapons[3].addAmmo(this.weapons[3].maxReserve);
        this.spendCash(cost, 'Munição Sniper');
      } else {
        this.spendCash(cost, 'Sniper Adquirida');
        this.weapons[3].owned = true;
        this.switchTo(3);
      }
    } else if (key === 'bazooka') {
      if (this.weapons[4].owned) {
        this.weapons[4].addAmmo(this.weapons[4].maxReserve);
        this.spendCash(cost, 'Foguetes Bazuca');
      } else {
        this.spendCash(cost, 'Bazuca Adquirida');
        this.weapons[4].owned = true;
        this.switchTo(4);
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
