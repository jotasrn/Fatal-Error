// Map 6: Brasília — Esplanada dos Ministérios.
// O coração do poder do Brasil desenhado em traços de caderno:
// - Eixo Monumental com pistas N1 e S1 e gramado central
// - Blocos dos Ministérios alinhados (Norte e Sul) com telhados para snipers e grapples
// - Catedral Metropolitana de Brasília com suas 16 colunas curvas e espelho d'água
// - Museu Nacional da República (cúpula monumental branca com rampa curva Niemeyer)
// - Biblioteca Nacional de Brasília e Rodoviária do Plano Piloto (mezanino e passarelas)
// - Congresso Nacional com as torres gêmeas, a cúpula da Câmara e a cúpula do Senado
// - Carros em movimento contínuo no tráfego das avenidas (sedans, fuscas e ônibus de Brasília)
// - Cidadãos e sistema policial integrado da PMDF
import * as THREE from 'three';
import { INK, makeInkMaterial } from '../render.js';
import { rand, TAU } from '../util.js';

export function buildBrasilia(B, arena = false) {
  const { L, box, slab, stairs, rail, cyl, sphere, ring, spawn, sniper, pickup, planes, addGeo, collider, scene, world } = B;
  const BK = INK.BLACK, BL = INK.BLUE, OR = INK.ORANGE, GN = INK.GREEN, PK = INK.PINK, RD = INK.RED;
  L.key = 'brasilia';

  const P = arena ? 72 : 62, PZ = 125, T = 6, PH = 24;
  L.bounds.minX = -P; L.bounds.maxX = P; L.bounds.minZ = -PZ; L.bounds.maxZ = PZ;
  L.playerStart.set(0, 0, -80); // Inicia perto da Rodoviária / Catedral

  const mat = (ink, fill = false) => makeInkMaterial({ ink, fill, side: fill ? THREE.DoubleSide : THREE.FrontSide });
  const mesh = (geo, ink, fill = false) => new THREE.Mesh(geo, mat(ink, fill));

  // ---------------- Chão base e limites da Esplanada ----------------
  box(0, -1, 0, 2 * P + T, 1, 2 * PZ + T, { ink: BK });
  // Paredes limítrofes do caderno
  box(0, 0, -PZ, 2 * P + T, PH, T, { ink: BK });
  box(0, 0, PZ, 2 * P + T, PH, T, { ink: BK });
  box(-P, 0, 0, T, PH, 2 * PZ + T, { ink: BK });
  box(P, 0, 0, T, PH, 2 * PZ + T, { ink: BK });
  collider(0, PH + 16, 0, 2 * P + 40, 8, 2 * PZ + 40, { noNav: true, noGrapple: true });

  // ---------------- O Eixo Monumental: Gramado Central e Avenidas N1/S1 ----------------
  // Gramado Central verdejante característico da Esplanada
  box(0, 0, 0, 26, 0.25, 2 * PZ - 10, { ink: GN });
  // Calçadas de pedestres centrais
  box(0, 0.25, 0, 4, 0.1, 2 * PZ - 10, { ink: BK });

  // Pista N1 (Norte, sentido Oeste -> Leste, Z crescente)
  box(-21, 0, 0, 14, 0.15, 2 * PZ - 10, { ink: BK });
  // Pista S1 (Sul, sentido Leste -> Oeste, Z decrescente)
  box(21, 0, 0, 14, 0.15, 2 * PZ - 10, { ink: BK });

  // Faixas brancas tracejadas nas pistas
  for (let z = -PZ + 15; z <= PZ - 15; z += 12) {
    box(-21, 0.16, z, 0.4, 0.05, 5, { ink: OR, noCollide: true });
    box(21, 0.16, z, 0.4, 0.05, 5, { ink: OR, noCollide: true });
  }

  // Canteiros e calçadas laterais externas
  box(-32, 0, 0, 6, 0.2, 2 * PZ - 10, { ink: GN });
  box(32, 0, 0, 6, 0.2, 2 * PZ - 10, { ink: GN });

  // ---------------- 1. Os Blocos dos Ministérios ----------------
  // 4 ministérios ao Norte (N1) e 4 ministérios ao Sul (S1)
  const zMinistries = [-45, -15, 15, 45];
  const MW = 18, MH = 13, MD = 22;

  // Lado Norte
  for (let i = 0; i < zMinistries.length; i++) {
    const mz = zMinistries[i];
    const mx = -46;
    // Corpo do bloco ministerial
    box(mx, 0, mz, MW, MH, MD, { ink: BL });
    box(mx, MH, mz, MW + 0.6, 0.4, MD + 0.6, { ink: BK });
    // Marquise de entrada
    box(mx + MW / 2 - 2, 0, mz, 5, 3.5, 9, { ink: BK });
    // Guarda-corpo do telhado
    rail(mx - MW / 2, mz - MD / 2, mx + MW / 2, mz - MD / 2, MH);
    rail(mx - MW / 2, mz + MD / 2, mx + MW / 2, mz + MD / 2, MH);
    rail(mx - MW / 2, mz - MD / 2, mx - MW / 2, mz + MD / 2, MH);
    rail(mx + MW / 2, mz - MD / 2, mx + MW / 2, mz + MD / 2, MH);
    // Escada de emergência traseira subindo até o teto
    stairs(mx - MW / 2 - 1.2, 0, mz - MD / 2 + 1, '+x', 14, 1.8, { rise: MH / 14, run: 0.45 });
    // Anel de grapple no teto
    ring(mx, MH + 3.2, mz, 'y');
    sniper(mx, MH, mz);
    spawn(mx + MW / 2 + 3, 0, mz);
    L.arenaSpawns.push(new THREE.Vector3(mx, MH, mz), new THREE.Vector3(mx + MW / 2 + 3, 0, mz));
  }

  // Lado Sul
  for (let i = 0; i < zMinistries.length; i++) {
    const mz = zMinistries[i];
    const mx = 46;
    box(mx, 0, mz, MW, MH, MD, { ink: GN });
    box(mx, MH, mz, MW + 0.6, 0.4, MD + 0.6, { ink: BK });
    box(mx - MW / 2 + 2, 0, mz, 5, 3.5, 9, { ink: BK });
    rail(mx - MW / 2, mz - MD / 2, mx + MW / 2, mz - MD / 2, MH);
    rail(mx - MW / 2, mz + MD / 2, mx + MW / 2, mz + MD / 2, MH);
    rail(mx - MW / 2, mz - MD / 2, mx - MW / 2, mz + MD / 2, MH);
    rail(mx + MW / 2, mz - MD / 2, mx + MW / 2, mz + MD / 2, MH);
    stairs(mx + MW / 2 + 1.2, 0, mz - MD / 2 + 1, '-x', 14, 1.8, { rise: MH / 14, run: 0.45 });
    ring(mx, MH + 3.2, mz, 'y');
    sniper(mx, MH, mz);
    spawn(mx - MW / 2 - 3, 0, mz);
    L.arenaSpawns.push(new THREE.Vector3(mx, MH, mz), new THREE.Vector3(mx - MW / 2 - 3, 0, mz));
  }

  // ---------------- 2. Catedral Metropolitana de Brasília ----------------
  {
    const cx = 36, cz = -85;
    // Espelho d'água circular na base
    cyl(cx, 0, cz, 13, 0.35, { ink: BL });
    // As 16 colunas hiperbólicas curvas de concreto estilizadas
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * TAU;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const colG = new THREE.Group();
      colG.position.set(cx + cosA * 8, 0, cz + sinA * 8);
      // Arco convergindo para o centro e abrindo para cima
      const c = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-cosA * 4.5, 8, -sinA * 4.5),
        new THREE.Vector3(cosA * 1.5, 16, sinA * 1.5)
      );
      colG.add(new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.45, 6, false), mat(BK, true)));
      scene.add(colG); L.meshes.push(colG);
    }
    // Cúpula central e cruz dourada no ápice
    sphere(cx, 4.5, cz, 5.5, { ink: BL });
    // Cruz
    box(cx, 16.5, cz, 0.35, 3.2, 0.35, { ink: OR, noCollide: true });
    box(cx, 18.2, cz, 1.8, 0.35, 0.35, { ink: OR, noCollide: true });
    ring(cx, 19.5, cz, 'y');
    spawn(cx, 0, cz + 14);
    pickup(cx, 0, cz - 14);
  }

  // ---------------- 3. Museu Nacional da República & Biblioteca ----------------
  {
    const mx = -36, mz = -82;
    // Cúpula semi-esférica monumental branca do Museu
    sphere(mx, 0, mz, 12, { ink: BK });
    // Espelho d'água semicircular na frente
    box(mx, 0, mz + 14, 20, 0.25, 6, { ink: BL });
    // Rampa monumental curva de Niemeyer que sobe até a entrada do mezanino
    const rampaG = new THREE.Group();
    const rampaCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(mx + 11, 0, mz + 8),
      new THREE.Vector3(mx + 8, 3, mz + 14),
      new THREE.Vector3(mx - 2, 6, mz + 11)
    );
    rampaG.add(new THREE.Mesh(new THREE.TubeGeometry(rampaCurve, 10, 1.2, 4, false), mat(BK, true)));
    scene.add(rampaG); L.meshes.push(rampaG);
    // Platô do mezanino
    slab(mx - 6, mz + 7, mx + 2, mz + 13, 6, 0.4);
    ring(mx, 12.5, mz, 'y');
    sniper(mx - 2, 6, mz + 10);

    // Biblioteca Nacional de Brasília (bloco cúbico adjacente)
    const bxX = -36, bxZ = -108;
    box(bxX, 0, bxZ, 16, 11, 14, { ink: OR });
    rail(bxX - 8, bxZ - 7, bxX + 8, bxZ - 7, 11);
    rail(bxX - 8, bxZ + 7, bxX + 8, bxZ + 7, 11);
    stairs(bxX - 9.5, 0, bxZ - 5, '+z', 12, 1.8, { rise: 11 / 12, run: 0.5 });
    ring(bxX, 13.5, bxZ, 'y');
    pickup(bxX, 11, bxZ);
  }

  // ---------------- 4. Rodoviária do Plano Piloto (Extremo Oeste) ----------------
  {
    const rz = -118;
    // Plataforma central de dois níveis da Rodoviária
    box(0, 0, rz, 58, 6.5, 18, { ink: BK });
    // Mezanino superior transitável
    slab(-28, rz - 8, 28, rz + 8, 6.5, 0.5);
    rail(-28, rz - 8, 28, rz - 8, 6.5);
    rail(-28, rz + 8, 28, rz + 8, 6.5);
    // Cobertura da Rodoviária
    box(0, 10.5, rz, 60, 0.4, 20, { ink: OR });
    // Pilares de concreto sustentando a marquise
    for (const px of [-22, -11, 0, 11, 22]) {
      box(px, 6.5, rz - 7, 0.8, 4, 0.8, { ink: BK });
      box(px, 6.5, rz + 7, 0.8, 4, 0.8, { ink: BK });
    }
    // Rampas e escadas de ligação térreo -> mezanino
    stairs(-14, 0, rz + 9.5, '+x', 13, 2.4, { rise: 6.5 / 13, run: 0.5 });
    stairs(14, 0, rz + 9.5, '-x', 13, 2.4, { rise: 6.5 / 13, run: 0.5 });
    ring(0, 13.5, rz, 'y');
    ring(-20, 9.5, rz, 'y');
    ring(20, 9.5, rz, 'y');
    sniper(0, 6.5, rz);
    spawn(-10, 6.5, rz); spawn(10, 6.5, rz);
    L.arenaSpawns.push(new THREE.Vector3(0, 6.5, rz), new THREE.Vector3(-15, 0, rz + 12), new THREE.Vector3(15, 0, rz + 12));
  }

  // ---------------- 5. Palácio do Congresso Nacional (Extremo Leste) ----------------
  {
    const pz = 105;
    // Laje monumental de base (Praça dos Três Poderes)
    box(0, 0, pz, 48, 3.8, 28, { ink: BK });
    // Rampa de acesso monumental de Niemeyer descendo até a Esplanada
    const rampaLen = 22;
    box(0, 0, pz - 14 - rampaLen / 2, 4.5, 0.3, rampaLen, { ink: BK });
    for (let s = 0; s < 10; s++) {
      box(0, s * (3.8 / 10), pz - 14 - rampaLen + s * (rampaLen / 10), 4.5, 0.4, rampaLen / 10 + 0.1, { ink: BK });
    }

    // Torres Gêmeas (Anexo I do Congresso Nacional - 26m de altura)
    const twH = 26;
    box(-4.5, 3.8, pz + 4, 6.5, twH, 5.5, { ink: BL }); // Torre 1
    box(4.5, 3.8, pz + 4, 6.5, twH, 5.5, { ink: BL });  // Torre 2
    // Passarela suspensa central ligando as duas torres
    box(0, 3.8 + 14, pz + 4, 4.5, 2.5, 3.5, { ink: BK });
    // Anéis de grapple no topo das torres
    ring(-4.5, 3.8 + twH + 2.5, pz + 4, 'y');
    ring(4.5, 3.8 + twH + 2.5, pz + 4, 'y');
    sniper(-4.5, 3.8 + twH, pz + 4);
    sniper(4.5, 3.8 + twH, pz + 4);

    // Cúpula da Câmara dos Deputados (prato virado para CIMA em X = -14)
    cyl(-14, 3.8, pz - 2, 7.5, 1.8, { ink: BK });
    sphere(-14, 3.8 + 1.2, pz - 2, 6.8, { ink: BK });
    ring(-14, 3.8 + 5.5, pz - 2, 'y');

    // Cúpula do Senado Federal (cúpula redonda convexa em X = 14)
    sphere(14, 3.8, pz - 2, 6.5, { ink: BK });
    ring(14, 3.8 + 7.5, pz - 2, 'y');

    pickup(0, 3.8, pz - 6);
    spawn(0, 3.8 + 14, pz + 4);
    L.arenaSpawns.push(new THREE.Vector3(-14, 3.8, pz - 2), new THREE.Vector3(14, 3.8, pz - 2), new THREE.Vector3(0, 3.8, pz));
  }

  // ---------------- 6. Tráfego de Carros em Movimento (Eixo Monumental) ----------------
  // Criamos uma frota de carros doodle dinâmicos trafegando nas pistas N1 e S1
  const cars = [];
  function makeDoodleCar(type = 'sedan', colorInk = BL) {
    const cg = new THREE.Group();
    const isBus = type === 'bus';
    const isBeetle = type === 'beetle';
    const w = isBus ? 2.8 : 1.9, h = isBus ? 2.6 : 1.2, d = isBus ? 8.5 : isBeetle ? 3.4 : 4.4;

    // Chassi / Carroceria
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(colorInk, true));
    bodyM.position.y = h / 2 + 0.35;
    cg.add(bodyM);

    // Teto / Cabine de passageiros
    if (!isBus) {
      const cabH = isBeetle ? 0.9 : 0.75;
      const cabM = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, cabH, d * 0.55), mat(BK, true));
      cabM.position.set(0, h + cabH / 2 + 0.25, -0.2);
      cg.add(cabM);
    } else {
      // Faixa decorativa no ônibus de Brasília
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.3, d + 0.05), mat(OR, true));
      stripe.position.y = h * 0.65;
      cg.add(stripe);
    }

    // 4 Rodas que giram
    const wheels = [];
    const rR = isBus ? 0.5 : 0.34;
    const wZ = d * 0.32;
    for (const sx of [-w / 2 - 0.08, w / 2 + 0.08]) {
      for (const sz of [-wZ, wZ]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(rR, rR, 0.2, 8), mat(BK, true));
        wh.rotation.z = Math.PI / 2;
        wh.position.set(sx, rR, sz);
        cg.add(wh);
        wheels.push(wh);
      }
    }

    // Faróis dianteiros acesos
    for (const sx of [-w * 0.35, w * 0.35]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.1), mat(OR, true));
      hl.position.set(sx, 0.7, d / 2 + 0.05);
      cg.add(hl);
    }

    scene.add(cg);
    L.meshes.push(cg);
    return { group: cg, wheels, w, h, d, isBus };
  }

  // Inicializa carros na pista N1 (X = -21, Z crescendo)
  const laneN1Z = [-100, -60, -20, 20, 60, 100];
  for (let i = 0; i < laneN1Z.length; i++) {
    const type = i % 3 === 0 ? 'bus' : i % 2 === 0 ? 'beetle' : 'sedan';
    const c = makeDoodleCar(type, i % 2 === 0 ? GN : BL);
    c.laneX = -21;
    c.z = laneN1Z[i];
    c.speed = (type === 'bus' ? 14 : 18) + rand(-1.5, 1.5);
    c.dir = 1; // para frente no eixo Z
    c.group.position.set(c.laneX, 0, c.z);
    c.group.rotation.y = 0;
    cars.push(c);
  }

  // Inicializa carros na pista S1 (X = 21, Z decrescendo)
  const laneS1Z = [-90, -50, -10, 30, 70, 110];
  for (let i = 0; i < laneS1Z.length; i++) {
    const type = i % 3 === 1 ? 'bus' : i % 2 === 0 ? 'beetle' : 'sedan';
    const c = makeDoodleCar(type, i % 2 === 0 ? RD : OR);
    c.laneX = 21;
    c.z = laneS1Z[i];
    c.speed = (type === 'bus' ? 14 : 18) + rand(-1.5, 1.5);
    c.dir = -1; // para trás no eixo Z
    c.group.position.set(c.laneX, 0, c.z);
    c.group.rotation.y = Math.PI;
    cars.push(c);
  }

  // Animação e física contínua do tráfego rodoviário
  let hornCd = 0;
  L.animated.push({
    mesh: null,
    update: (t) => {
      const dt = 0.016;
      hornCd -= dt;
      const playerPos = B.scene.parent ? null : null; // obtido via ctx no main se necessário

      for (const car of cars) {
        car.z += car.speed * car.dir * dt;
        // Loop infinito ao sair do mapa
        if (car.dir > 0 && car.z > PZ + 10) car.z = -PZ - 10;
        if (car.dir < 0 && car.z < -PZ - 10) car.z = PZ + 10;

        car.group.position.set(car.laneX, 0, car.z);
        // Gira as rodas conforme a velocidade
        for (const wh of car.wheels) wh.rotation.x += car.speed * dt * 2.2;
      }
    }
  });
  L.cars = cars; // Exposto para o main.js verificar atropelamentos e buzinas!

  // ---------------- 7. Spawns e Pickups Espalhados pela Esplanada ----------------
  // Spawns no gramado central
  for (let z = -90; z <= 90; z += 24) {
    spawn(0, 0, z);
    pickup(0, 0, z);
  }
  // Pickups nos ministérios e pontos de confronto
  for (const mz of zMinistries) {
    pickup(-30, 0, mz);
    pickup(30, 0, mz);
  }

  // ---------------- 8. Céu de Brasília (Céu Azul do Cerrado e Sol) ----------------
  addGeo(new THREE.SphereGeometry(14, 14, 9).translate(90, 110, -170), OR);
  for (const [cx, cy, cz] of [[-80, 85, -120], [60, 100, 140], [120, 80, 20]]) {
    for (let i = 0; i < 6; i++) sphere(cx + (i - 2.5) * 7, cy + Math.sin(i * 1.5) * 3, cz, 6, { seg: 8, ink: BL });
  }
  planes(5, 42, 35, { rStep: 12, hStep: 7, scale: 1.8 });

  return B.finish();
}
