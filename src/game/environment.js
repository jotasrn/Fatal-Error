// Ciclo de dia e noite + clima de Brasília.
//  - Hora do jogo: 1 hora = 60 s (um dia inteiro em 24 min). O sol nasce a leste (Congresso, +Z),
//    passa alto e se põe a oeste, atrás da Torre de TV — o pôr do sol do Eixo Monumental.
//  - Pôr do sol de Brasília: horizonte em brasa (laranja → rosa → lilás), nuvens acesas por baixo.
//  - Chuva "do nada": pancadas que chegam em segundos, às vezes COM SOL (e arco-íris), às vezes
//    tempestade com céu fechado, relâmpagos e trovões. Chão molhado que seca devagar depois.
//  - O clima sai do relógio real (todo mundo numa partida online vê a mesma chuva, sem rede);
//    a hora começa no fim da tarde em cada sessão e corre sozinha.
//  - Horário de pico (7–9h, 12–14h, 17h30–19h30): mais carros e mais pedestres nos lugares certos.
import * as THREE from 'three';
import { ENV } from '../core/render.js';

const SEC_PER_HOUR = 60;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

// paleta do céu e da luz por altura do sol (elevação = sunDir.y)
const KEYS = [
  { e: -0.30, zen: [0.010, 0.016, 0.045], hor: [0.035, 0.05, 0.10], glow: [0.04, 0.04, 0.08], sun: [0.07, 0.09, 0.15], amb: [0.17, 0.20, 0.32] },
  { e: -0.12, zen: [0.035, 0.05, 0.14], hor: [0.20, 0.14, 0.26], glow: [0.35, 0.14, 0.22], sun: [0.08, 0.08, 0.13], amb: [0.20, 0.20, 0.32] },
  { e: -0.03, zen: [0.12, 0.15, 0.36], hor: [0.78, 0.32, 0.32], glow: [0.95, 0.32, 0.22], sun: [0.18, 0.11, 0.10], amb: [0.32, 0.27, 0.40] },
  { e: 0.03, zen: [0.24, 0.32, 0.62], hor: [1.00, 0.50, 0.22], glow: [1.00, 0.45, 0.15], sun: [0.62, 0.34, 0.16], amb: [0.40, 0.33, 0.42] },
  { e: 0.14, zen: [0.33, 0.50, 0.85], hor: [0.98, 0.76, 0.52], glow: [0.95, 0.62, 0.30], sun: [0.56, 0.44, 0.30], amb: [0.52, 0.52, 0.60] },
  { e: 0.40, zen: [0.40, 0.66, 0.96], hor: [0.84, 0.91, 0.99], glow: [0.55, 0.48, 0.38], sun: [0.42, 0.40, 0.36], amb: [0.66, 0.68, 0.72] },
];
function palette(e, out) {
  let i = 0; while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)));
  for (const k of ['zen', 'hor', 'glow', 'sun', 'amb']) out[k].set(a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t, a[k][2] + (b[k][2] - a[k][2]) * t);
}

// Clima determinístico: janelas de 150 s; cada uma pode ter uma pancada (≈40%).
const SLOT = 150;
function weatherAt(tSec) {
  const k = Math.floor(tSec / SLOT), f = tSec - k * SLOT;
  const out = { rain: 0, cloud: 0.22 + 0.25 * hash(k * 3.7), sunVis: 1, storm: 0 };
  if (hash(k) < 0.4) {
    const t0 = 8 + hash(k + 0.31) * 30, dur = 45 + hash(k + 0.77) * 70, sunny = hash(k + 0.53) < 0.45;
    const build = smooth(t0 - 16, t0, f) * (1 - smooth(t0 + dur, t0 + dur + 18, f));     // nuvens chegam antes
    const pour = smooth(t0, t0 + 5, f) * (1 - smooth(t0 + dur - 6, t0 + dur + 6, f));    // a chuva desaba rápido
    out.cloud = Math.max(out.cloud, build * (sunny ? 0.55 : 0.97));
    out.sunVis = 1 - build * (sunny ? 0.0 : 0.85);
    out.rain = pour * (sunny ? 0.55 + 0.25 * hash(k + 0.9) : 0.85 + 0.15 * hash(k + 0.9));
    out.storm = sunny ? 0 : pour;
  }
  return out;
}

// pesos de "movimento" por hora: 0 madrugada … 1 pico
export function rushFactor(h) {
  const peak = (c, w) => Math.exp(-((h - c) * (h - c)) / (2 * w * w));
  const base = 0.12 + 0.33 * smooth(5.5, 7, h) * (1 - smooth(21, 23.5, h));
  return Math.min(1, base + 0.75 * peak(8, 0.8) + 0.4 * peak(12.8, 0.8) + 0.8 * peak(18.4, 0.9));
}

export function createEnvironment(ctx) {
  const pal = { zen: new THREE.Vector3(), hor: new THREE.Vector3(), glow: new THREE.Vector3(), sun: new THREE.Vector3(), amb: new THREE.Vector3() };
  const _moon = new THREE.Vector3();
  let weatherOverride = null, hourOverride = null, hourOffset = 0, wet = 0, flashT = 0, nextBolt = 6, lampT = 0, rainAudio = null;
  const env = {
    hour: 12, rush: 0.5, rain: 0, weatherOff: false,
    // fixa uma hora (0–24) ou volta ao automático (null)
    // força um clima ({ rain, cloud, sunVis, storm }) ou volta ao automático (null)
    setWeather(w) { weatherOverride = w ? { rain: 0, cloud: 0.25, sunVis: 1, storm: 0, ...w } : null; },
    setWet(v) { wet = Math.min(1, Math.max(0, v)); },
    setHour(h) { hourOverride = h == null ? null : ((h % 24) + 24) % 24; },
    // desloca o relógio automático para começar perto de uma hora (sem congelar)
    startAt(h) { const real = (Date.now() / 1000 / SEC_PER_HOUR) % 24; hourOffset = h - real; },
    timeLabel() { const h = Math.floor(env.hour), m = Math.floor((env.hour - h) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); },
    update(dt) {
      const nowS = Date.now() / 1000;
      env.hour = hourOverride != null ? hourOverride : ((nowS / SEC_PER_HOUR + hourOffset) % 24 + 24) % 24;
      const h = env.hour;
      // sol: nasce ~6h a leste (+Z), põe ~18h20 a oeste (-Z), leve inclinação ao norte (+X)
      const ang = Math.PI * (h - 6.0) / 12.4;
      ENV.sunDir.set(0.24, Math.sin(ang), Math.cos(ang)).normalize();
      const e = ENV.sunDir.y;
      palette(e, pal);
      // clima
      const w = weatherOverride || (env.weatherOff ? { rain: 0, cloud: 0.25, sunVis: 1, storm: 0 } : weatherAt(nowS));
      const k = Math.min(1, dt * 1.5);
      ENV.rain += (w.rain - ENV.rain) * k; ENV.cloud += (w.cloud + 0.12 * smooth(0.25, 0.0, Math.abs(e)) - ENV.cloud) * k;
      ENV.sunVis += (w.sunVis - ENV.sunVis) * k;
      env.rain = ENV.rain;
      wet = ENV.rain > 0.05 ? Math.min(1, wet + dt * 0.16 * ENV.rain) : Math.max(0, wet - dt * 0.011);
      ENV.wet = wet;
      // luz: sol (achatado para não rasantear demais no cel) ou lua; nuvens apagam a luz direta
      const night = smooth(0.02, -0.14, e);
      ENV.night = night;
      if (e > -0.06) ENV.lightDir.set(ENV.sunDir.x, Math.max(e, 0.14), ENV.sunDir.z).normalize();
      else ENV.lightDir.copy(_moon.set(-ENV.sunDir.x, Math.max(-e, 0.45), -ENV.sunDir.z).normalize());
      const overcast = (1 - ENV.sunVis) * 0.75;
      ENV.sunCol.copy(pal.sun).multiplyScalar(1 - overcast);
      ENV.ambCol.copy(pal.amb).multiplyScalar(1 - ENV.rain * 0.18 - overcast * 0.1).addScaledVector(pal.sun, overcast * 0.45)
        .multiplyScalar(1 - 0.32 * ENV.rain * (1 - ENV.sunVis));   // tempestade escurece a cidade
      ENV.skyZen.copy(pal.zen); ENV.skyHor.copy(pal.hor); ENV.skyGlow.copy(pal.glow);
      // relâmpagos e trovões na tempestade
      flashT = Math.max(0, flashT - dt);
      if (w.storm > 0.6) {
        nextBolt -= dt;
        if (nextBolt <= 0) {
          nextBolt = 5 + Math.random() * 11; flashT = 0.22;
          const a = ctx.audio; if (a && a.ctx) { const d = 0.5 + Math.random() * 2.5; a.noise({ dur: 3.2, gain: 0.55, type: 'lowpass', freq: 260, freqEnd: 45, attack: 0.05, delay: d }); a.noise({ dur: 1.2, gain: 0.25, type: 'lowpass', freq: 900, freqEnd: 120, delay: d }); }
        }
      }
      ENV.flash = flashT > 0 ? (Math.sin(flashT * 60) * 0.5 + 0.5) * flashT * 2.4 * (0.5 + 0.5 * night) : 0;
      // postes acesos: as 16 luminárias mais próximas da câmera
      lampT -= dt;
      const L = ctx.level, cam = ctx.camera;
      if (lampT <= 0 && L && L.lampHeads && cam) {
        lampT = 0.35;
        if (night > 0.02 || ENV.cloud > 0.85) {
          const px = cam.position.x, pz = cam.position.z, best = [];
          for (const v of L.lampHeads) {
            const d = (v.x - px) ** 2 + (v.z - pz) ** 2; if (d > 140 * 140) continue;
            if (best.length < 16) { best.push([d, v]); if (best.length === 16) best.sort((a, b) => a[0] - b[0]); }
            else if (d < best[15][0]) { best[15] = [d, v]; best.sort((a, b) => a[0] - b[0]); }
          }
          ENV.lampN = best.length; for (let i = 0; i < best.length; i++) ENV.lamps[i].copy(best[i][1]);
        } else ENV.lampN = 0;
      }
      if (!(L && L.lampHeads)) ENV.lampN = 0;
      // som da chuva (ruído filtrado em loop)
      const a = ctx.audio;
      if (a && a.ctx && a.master) {
        if (!rainAudio && ENV.rain > 0.02) {
          const src = a.ctx.createBufferSource(); src.buffer = a.noiseBuf; src.loop = true;
          const f = a.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.4;
          const g = a.ctx.createGain(); g.gain.value = 0;
          src.connect(f); f.connect(g); g.connect(a.master); src.start();
          rainAudio = { src, g };
        }
        if (rainAudio) rainAudio.g.gain.setTargetAtTime(ENV.rain * 0.16, a.ctx.currentTime, 0.4);
      }
      env.rush = rushFactor(h);
    },
  };
  env.startAt(16.9);   // começa no fim da tarde: em ~1,5 min o sol se põe atrás da Torre de TV
  return env;
}
