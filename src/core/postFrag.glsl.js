// Passe final (tela cheia): cel-shading + contorno de tinta, agora com
//  - posição no MUNDO reconstruída da profundidade → texturas procedurais (grama do cerrado, asfalto,
//    calçada em placas, concreto, folhagem) sem precisar de UV nem de imagens;
//  - céu dinâmico (ciclo dia/noite, pôr do sol de Brasília, nuvens, arco-íris na chuva com sol);
//  - luz do sol/lua colorida, postes acendendo à noite com poças de luz no chão, janelas acesas;
//  - chuva: pista molhada refletindo o céu, poças, riscos de chuva na tela.
// Etiqueta de material (tag) vai na fração do id de tinta: g = id + tag/16.
//   tag 1 folhagem · 2 casca/madeira · 3 pintura de via · 4 luz (emissivo) · 5 metal · 6 flores
export const postFrag = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uAspect;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uHurt;
uniform float uFlash;
uniform float uSlow;
uniform float uLowHp;
uniform float uNotebook;
uniform float uFastEdge;
uniform float uLineSpacing;
uniform vec3 uPaper;
uniform vec3 uLightView;
uniform vec3 uUpView;
uniform vec3 uCamFwd;
uniform vec3 uInks[8];
// ---- ambiente
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uSunDir;      // direção do sol (mundo), pode estar abaixo do horizonte
uniform vec3 uSunCol;      // cor/força da luz direta (sol ou lua)
uniform vec3 uAmbCol;      // luz ambiente
uniform vec3 uSkyZen;
uniform vec3 uSkyHor;
uniform vec3 uSkyGlow;     // cor do brilho em volta do sol (laranja no fim de tarde)
uniform float uNight;      // 0 dia … 1 noite
uniform float uCloud;      // cobertura de nuvens 0..1
uniform float uSunVis;     // sol visível (0 = encoberto)
uniform float uRain;       // intensidade da chuva 0..1
uniform float uWet;        // chão molhado 0..1
uniform float uDetail;     // 0 = qualidade baixa (sem texturas)
uniform vec3 uLamps[16];
uniform int uLampN;

float linDepth(float z) {
  float zn = z * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear));
}

vec3 baseInk(int i) {
  if (i <= 0) return uInks[0];
  if (i == 1) return uInks[1];
  if (i == 2) return uInks[2];
  if (i == 3) return uInks[3];
  if (i == 4) return uInks[4];
  if (i == 5) return uInks[5];
  if (i == 6) return uInks[6];
  return uInks[7];
}

// ---------------------------------------------------------------- ruído
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm3(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.03 + 17.1) * 0.3 + vnoise(p * 4.11 + 41.7) * 0.15; }
float fbm5(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.02 + vec2(13.7, 7.3); a *= 0.5; }
  return s / 0.97;
}

// ---------------------------------------------------------------- céu
vec3 skyBase(vec3 rd) {
  float y = rd.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.45);
  vec3 c = mix(uSkyHor, uSkyZen, t);
  // banda escura abaixo do horizonte (só se vê do alto)
  c = mix(c, uSkyHor * 0.72, smoothstep(0.0, -0.25, y));
  // brilho do sol: forte e largo no pôr do sol, espalhado pelo horizonte (céu de Brasília pegando fogo)
  float sd = max(dot(rd, uSunDir), 0.0);
  float low = 1.0 - smoothstep(0.0, 0.45, uSunDir.y);
  float horiz = exp(-abs(y) * 5.0);
  c += uSkyGlow * (pow(sd, 6.0) * 0.55 + pow(sd, 2.0) * 0.25 * low) * (0.4 + 0.6 * horiz) * (0.35 + 0.65 * uSunVis);
  c += uSkyGlow * horiz * low * 0.22 * smoothstep(-0.25, 0.05, uSunDir.y);
  // tempo fechado: céu cinza
  vec3 gray = vec3(dot(c, vec3(0.3, 0.55, 0.15))) * vec3(0.92, 0.95, 1.0);
  c = mix(c, gray * (0.72 - 0.32 * uRain), clamp((uCloud - 0.55) * 2.2, 0.0, 1.0) * (1.0 - uSunVis * 0.6));
  return c;
}

vec3 skyFull(vec3 rd) {
  vec3 c = skyBase(rd);
  float sd = dot(rd, uSunDir);
  // disco do sol (grande e alaranjado perto do horizonte)
  float low = 1.0 - smoothstep(0.0, 0.4, uSunDir.y);
  float disk = smoothstep(0.99935 - low * 0.0005, 0.99975 - low * 0.0004, sd);
  c = mix(c, uSkyGlow * 1.6 + vec3(0.35, 0.3, 0.2), disk * uSunVis * smoothstep(-0.03, 0.02, uSunDir.y));
  // lua e estrelas
  vec3 md = -uSunDir;
  float moon = smoothstep(0.99955, 0.99975, dot(rd, md));
  c += vec3(0.85, 0.88, 0.95) * moon * uNight * (1.0 - uCloud * 0.8);
  if (uNight > 0.01 && rd.y > 0.0) {
    vec2 sp = rd.xz / (rd.y + 0.35) * 220.0;
    float st = step(0.9965, hash12(floor(sp)));
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + hash12(floor(sp) + 3.0) * 30.0);
    c += vec3(st * tw * uNight * (1.0 - uCloud) * smoothstep(0.0, 0.25, rd.y));
  }
  // nuvens (cúmulos altos típicos do Planalto), iluminadas pelo sol
  if (rd.y > 0.0) {
    vec2 cp = rd.xz / (rd.y + 0.2) * 2.2 + vec2(uTime * 0.012, uTime * 0.004);
    float n = fbm5(cp * 0.9);
    float cov = mix(0.62, 0.28, uCloud);
    float dens = smoothstep(cov, cov + 0.22, n) * smoothstep(0.0, 0.12, rd.y);
    float nl = fbm3((cp + uSunDir.xz * 0.05) * 0.9);
    float lit = clamp(0.55 + (n - nl) * 4.0, 0.0, 1.0);
    vec3 sunLit = mix(vec3(1.0), uSkyGlow * 1.25 + vec3(0.25), (1.0 - smoothstep(0.05, 0.5, uSunDir.y)) * 0.85);
    vec3 cloudCol = mix(uSkyZen * 0.55 + uAmbCol * 0.35, sunLit * (0.55 + 0.6 * uSunCol.r), lit * (0.35 + 0.65 * uSunVis));
    cloudCol = mix(cloudCol, vec3(0.42, 0.45, 0.5) * (0.4 + 0.6 * (1.0 - uNight)), uRain * 0.6);
    cloudCol *= mix(1.0, 0.22, uNight);
    cloudCol *= mix(1.0, 0.5, uRain * (1.0 - uSunVis));   // tempestade: nuvem de chumbo
    c = mix(c, cloudCol, dens * 0.92);
  }
  // arco-íris: chuva com sol, sol baixo, do lado oposto ao sol
  if (uRain > 0.05 && uSunVis > 0.3 && uSunDir.y > 0.0 && uSunDir.y < 0.7) {
    float ang = degrees(acos(clamp(dot(rd, -uSunDir), -1.0, 1.0)));
    float b = (ang - 40.4) / 2.2;
    if (b > 0.0 && b < 1.0) {
      vec3 rb = clamp(abs(mod(b * 6.0 * 0.85 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      float a = sin(b * 3.14159) * 0.32 * uRain * uSunVis * smoothstep(0.0, 0.08, rd.y);
      c = mix(c, c + rb * 0.6, a);
    }
  }
  return c;
}

// ---------------------------------------------------------------- superfícies
vec3 surfaceCelColor(int id, float shade, float ndl, float upAmt) {
  float lit = (shade >= 0.0 && shade <= 0.995) ? shade : ndl;
  float b1 = smoothstep(0.28, 0.36, lit);
  float b2 = smoothstep(0.64, 0.74, lit);
  float cel = clamp(0.24 + 0.46 * b1 + 0.30 * b2 + max(0.0, upAmt) * 0.07, 0.0, 1.0);
  vec3 p = baseInk(id);
  if (shade < 0.0) {
    float fCel = 0.72 + 0.24 * b1 + 0.14 * b2;
    vec3 pf = (id == 2) ? vec3(0.33, 0.34, 0.36) : p;
    return clamp(pf * fCel, 0.0, 1.0);
  }
  if (shade > 0.995) {
    vec3 darkC = p * 0.58 + vec3(0.03);
    vec3 litC = min(vec3(1.0), p * 1.15 + vec3(0.16));
    return mix(darkC, litC, cel);
  }
  if (id == 2) return mix(vec3(0.58, 0.62, 0.70), vec3(0.95, 0.95, 0.96), cel);
  if (id == 0) return mix(vec3(0.30, 0.46, 0.78), vec3(0.76, 0.86, 0.98), cel);
  if (id == 4) return mix(vec3(0.18, 0.48, 0.26), vec3(0.42, 0.78, 0.45), cel);
  if (id == 3) return mix(vec3(0.74, 0.43, 0.09), vec3(0.99, 0.80, 0.26), cel);
  if (id == 1) return mix(vec3(0.60, 0.14, 0.19), vec3(0.95, 0.34, 0.36), cel);
  if (id == 5) return mix(vec3(0.66, 0.27, 0.49), vec3(0.96, 0.58, 0.78), cel);
  return mix(p * 0.55, min(vec3(1.0), p * 1.12 + vec3(0.14)), cel);
}

// Grama do Plano Piloto: verde com manchas secas do cerrado, terra vermelha (latossolo) e tufos.
vec3 texGrass(vec3 c, vec3 wp, float fade) {
  vec2 q = wp.xz;
  // verde mais natural (menos neon), com variação grande de umidade
  c = mix(c, c * vec3(0.86, 0.9, 0.66) + vec3(0.03, 0.02, 0.0), 0.55);
  float big = fbm3(q * 0.018);
  float mid = fbm3(q * 0.11 + 5.0);
  float dry = smoothstep(0.40, 0.72, big * 0.75 + mid * 0.35);
  float lum = dot(c, vec3(0.3, 0.55, 0.15));
  vec3 dryC = vec3(0.80, 0.72, 0.40) * (0.45 + lum * 1.1);
  c = mix(c, dryC, dry * 0.62);
  float soil = smoothstep(0.73, 0.85, fbm3(q * 0.045 + 31.0)) * (0.55 + 0.45 * mid);
  c = mix(c, vec3(0.62, 0.33, 0.21) * (0.55 + lum * 0.9), soil * 0.75);
  c *= 0.88 + 0.24 * mid;
  if (fade > 0.0) {
    // tufos e folhas: ruído suave em 2 escalas, levemente alongado (sem quadradinhos)
    float t1 = vnoise(q * vec2(2.3, 1.6));
    float t2 = vnoise(q * vec2(9.0, 5.5) + 3.7);
    float t3 = vnoise(q * vec2(23.0, 13.0) + 9.1);
    c *= 1.0 + ((t1 - 0.5) * 0.16 + (t2 - 0.5) * 0.16 + (t3 - 0.5) * 0.12) * fade;
    // florzinhas do gramado (amarelas/brancas), em grupinhos
    vec2 fq = q * 2.2;
    float fl = smoothstep(0.86, 0.95, vnoise(fq)) * smoothstep(0.6, 0.85, vnoise(q * 0.25 + 4.0)) * fade * (1.0 - dry);
    c = mix(c, mix(vec3(1.0, 0.85, 0.28), vec3(0.98, 0.97, 0.92), step(0.5, hash12(floor(q * 0.25)))), fl * 0.75);
  }
  return c;
}

// Asfalto: agregado, desgaste, remendos, trincas e manchas de óleo.
vec3 texAsphalt(vec3 c, vec3 wp, float fade) {
  vec2 q = wp.xz;
  float st = fbm3(q * 0.07);
  c *= 0.84 + 0.3 * st;
  // remendos retangulares
  vec2 cell = floor(q / 7.0);
  float hp = hash12(cell + 11.0);
  vec2 f = fract(q / 7.0);
  float patchM = step(0.86, hp) * step(0.15, f.x) * step(f.x, 0.75) * step(0.2, f.y) * step(f.y, 0.65);
  c *= 1.0 - patchM * 0.18;
  if (fade > 0.0) {
    float ag = vnoise(q * 14.0) * 0.6 + vnoise(q * 37.0) * 0.4;
    c *= 1.0 + (ag - 0.5) * 0.2 * fade;
    // trincas (linhas de ruído "ridged")
    float r = abs(vnoise(q * 0.55 + 3.0) - 0.5);
    float crack = (1.0 - smoothstep(0.0, 0.018, r)) * smoothstep(0.55, 0.7, vnoise(q * 0.12));
    c *= 1.0 - crack * 0.45 * fade;
    float oil = smoothstep(0.78, 0.9, vnoise(q * 0.35 + 9.0));
    c *= 1.0 - oil * 0.22 * fade;
  }
  return c;
}

// Calçada/concreto horizontal: placas com juntas, manchas de uso.
vec3 texPavement(vec3 c, vec3 wp, float fade) {
  vec2 q = wp.xz;
  c *= 0.9 + 0.14 * fbm3(q * 0.09);
  if (fade > 0.0) {
    vec2 g = abs(fract(q / 1.5) - 0.5);
    float j = smoothstep(0.475, 0.495, max(g.x, g.y));
    c *= 1.0 - j * 0.22 * fade;
    float tile = hash12(floor(q / 1.5));
    c *= 1.0 + (tile - 0.5) * 0.08 * fade;
    c *= 1.0 + (vnoise(q * 11.0) - 0.5) * 0.08 * fade;
  }
  return c;
}

// Concreto vertical: faixas de forma, escorridos de chuva escurecendo de cima para baixo.
vec3 texConcreteWall(vec3 c, vec3 wp, vec3 nW, float fade) {
  vec2 q = abs(nW.x) > abs(nW.z) ? wp.zy : wp.xy;
  float streak = vnoise(vec2(q.x * 1.3, q.y * 0.06)) * vnoise(vec2(q.x * 0.3, q.y * 0.02 + 4.0));
  c *= 1.0 - smoothstep(0.25, 0.6, streak) * 0.16;
  c *= 0.93 + 0.1 * fbm3(q * 0.15);
  if (fade > 0.0) {
    float b2 = smoothstep(0.48, 0.495, abs(fract(q.y / 1.2) - 0.5));
    c *= 1.0 - b2 * 0.1 * fade;
  }
  return c;
}

// Folhagem: copas em tufos (luz e sombra salpicadas), sem cara de "pirulito".
vec3 texFoliage(vec3 c, vec3 wp, float fade) {
  float n = vnoise(wp.xz * 1.6 + wp.y * 1.3) * 0.6 + vnoise(wp.xy * 3.1 + wp.z) * 0.4;
  c *= 0.78 + 0.42 * n;
  if (fade > 0.0) c *= 1.0 + (hash12(floor(wp.xz * 5.0 + wp.y * 3.0)) - 0.5) * 0.22 * fade;
  return c;
}

// Casca de árvore: fissuras verticais.
vec3 texBark(vec3 c, vec3 wp, float fade) {
  float f = vnoise(vec2((wp.x + wp.z) * 9.0, wp.y * 1.4));
  c = c * vec3(1.25, 1.02, 0.80) + vec3(0.03, 0.015, 0.0);   // casca amarronzada
  return c * (0.75 + 0.4 * f * (0.5 + 0.5 * fade));
}

// Fachada: coordenadas na parede (u ao longo, v = altura)
vec2 facadeUV(vec3 wp, vec3 nW) { return vec2(abs(nW.x) > abs(nW.z) ? wp.z : wp.x, wp.y); }
// faixa de janelas do andar (1 dentro do vidro); andares de 1,9 u, módulos de 1,3 u
float windowMask(vec2 q) {
  vec2 f = vec2(fract(q.x / 1.3), fract(q.y / 1.9));
  return step(0.1, f.x) * step(f.x, 0.9) * step(0.22, f.y) * step(f.y, 0.86);
}
float windowLight(vec3 wp, vec3 nW) {
  vec2 q = facadeUV(wp, nW);
  vec2 cell = vec2(floor(q.x / 1.3), floor(q.y / 1.9));
  float on = step(0.55, hash12(cell * vec2(1.0, 7.0) + floor(vec2(wp.x, wp.z) / 30.0) * 3.0));
  return windowMask(q) * on;
}

void main() {
  vec2 px = 1.0 / uRes;
  float sc = clamp(uRes.y / 900.0, 0.75, 2.0);
  vec4 s = texture2D(tScene, vUv);
  float z = texture2D(tDepth, vUv).x;
  bool sky = z >= 0.99999;

  // raio da câmera no mundo
  vec4 vp4 = uInvProj * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  vec3 vpos = vp4.xyz / vp4.w;
  vec4 vfar = uInvProj * vec4(vUv * 2.0 - 1.0, 0.5, 1.0);
  vec3 rd = normalize(mat3(uCamWorld) * (vfar.xyz / vfar.w));
  vec3 camPos = (uCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

  vec3 skyCol;
  if (uNotebook > 0.5) {
    vec2 pp = gl_FragCoord.xy;
    float ls = uLineSpacing;
    float ly = mod(pp.y + ls * 0.5, ls);
    float rule = 1.0 - smoothstep(0.5 * sc, 1.6 * sc, abs(ly - ls * 0.5));
    skyCol = mix(uPaper, vec3(0.64, 0.75, 0.93), rule * 0.38);
  } else {
    skyCol = sky ? skyFull(rd) : skyBase(rd);
  }

  // contornos
  float o = 1.05 * sc;
  vec2 ox = vec2(o * px.x, 0.0), oy = vec2(0.0, o * px.y);
  float zl = texture2D(tDepth, vUv - ox).x;
  float zr = texture2D(tDepth, vUv + ox).x;
  float zu = texture2D(tDepth, vUv + oy).x;
  float zd = texture2D(tDepth, vUv - oy).x;
  float d = sky ? uFar : linDepth(z);
  float iw = 1.0 / d;
  float lap = abs(1.0 / linDepth(zl) + 1.0 / linDepth(zr) - 2.0 * iw)
            + abs(1.0 / linDepth(zu) + 1.0 / linDepth(zd) - 2.0 * iw);
  float edge = smoothstep(0.065, 0.24, lap / (iw + 1e-7));
  float zmin = z;
  float inkId = s.g;
  if (uFastEdge < 0.5) {
    vec4 sl = texture2D(tScene, vUv - ox);
    vec4 sr = texture2D(tScene, vUv + ox);
    vec4 su = texture2D(tScene, vUv + oy);
    vec4 sd = texture2D(tScene, vUv - oy);
    float nEdge = length(sl.ba - sr.ba) + length(su.ba - sd.ba);
    // mesma superfície contínua (ex.: malha do gramado/relevo): só conta como borda um degrau de verdade,
    // não a emenda entre triângulos vista de raspão (eram os "+" e tracejados pretos na grama)
    float cid = floor(s.g + 0.5);
    bool same = floor(sl.g + 0.5) == cid && floor(sr.g + 0.5) == cid && floor(su.g + 0.5) == cid && floor(sd.g + 0.5) == cid;
    if (same && nEdge < 0.3) edge = smoothstep(0.55, 1.3, lap / (iw + 1e-7));
    edge = max(edge, smoothstep(0.48, 0.88, nEdge) * 0.85);
    float idEdge = abs(floor(sl.g + 0.5) - floor(sr.g + 0.5)) + abs(floor(su.g + 0.5) - floor(sd.g + 0.5));
    edge = max(edge, smoothstep(0.2, 0.8, idEdge) * 0.55);
    if (zl < zmin) { zmin = zl; inkId = sl.g; }
    if (zr < zmin) { zmin = zr; inkId = sr.g; }
    if (zu < zmin) { zmin = zu; inkId = su.g; }
    if (zd < zmin) { zmin = zd; inkId = sd.g; }
  }
  float dFront = linDepth(zmin);

  vec3 col = skyCol;
  if (!sky) {
    vec2 nxy = s.ba;
    vec3 nView = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
    vec3 nW = normalize(mat3(uCamWorld) * nView);
    vec3 wp = (uCamWorld * vec4(vpos, 1.0)).xyz;
    float ndl = dot(nView, uLightView) * 0.5 + 0.5;
    float upAmt = dot(nView, uUpView);
    int surfId = int(s.g + 0.5);
    int tag = int((s.g - float(surfId)) * 16.0 + 0.5);
    bool character = s.r > 0.995;
    bool filled = s.r < 0.0;
    vec3 surf = surfaceCelColor(surfId, s.r, ndl, upAmt);
    if (uNotebook > 0.5 && s.r >= 0.0 && s.r <= 0.995) surf = mix(uPaper, surf, 0.68);

    // ---- texturas procedurais
    float fade = (1.0 - smoothstep(35.0, 140.0, d)) * uDetail;
    float far = uDetail * (1.0 - smoothstep(260.0, 620.0, d));
    bool isFlat = nW.y > 0.72;
    bool asphalt = false, grass = false;
    if (!character && far > 0.0 && uNotebook < 0.5) {
      if (tag == 1) surf = texFoliage(surf, wp, fade);
      else if (tag == 2) surf = texBark(surf, wp, fade);
      else if (tag == 6) surf = texFoliage(surf, wp * 1.7, fade) * 1.05;
      else if (tag == 3) surf *= 1.0 - smoothstep(0.55, 0.85, vnoise(wp.xz * 2.2)) * 0.22 * fade;   // tinta gasta
      else if (tag == 0) {
        if (surfId == 4 && isFlat) { surf = texGrass(surf, wp, fade); grass = true; }
        else if (surfId == 2 && filled && isFlat) { surf = texAsphalt(surf, wp, fade); asphalt = true; }
        else if (surfId == 2 && !filled && isFlat) surf = texPavement(surf, wp, fade);
        else if (surfId == 2 && !filled && abs(nW.y) < 0.3) surf = texConcreteWall(surf, wp, nW, fade);
      } else if (tag == 7 && abs(nW.y) < 0.3) {
        // fachada: concreto/pastilha com faixas de vidro por andar refletindo o céu
        if (surfId == 2) surf = texConcreteWall(surf, wp, nW, fade);
        float wf = 1.0 - smoothstep(180.0, 420.0, d);
        float win = windowMask(facadeUV(wp, nW)) * wf;
        vec3 glass = mix(surf * 0.42 + vec3(0.02, 0.04, 0.07), skyBase(reflect(rd, nW)) * 0.75, 0.45);
        surf = mix(surf, glass, win * 0.8);
        surf = mix(surf, surf * 0.8 + glass * 0.12, (1.0 - wf) * 0.6);   // de longe: tom médio, sem cintilar
      }
    }

    // ---- molhado: escurece, poças refletem o céu
    if (uWet > 0.0 && isFlat && !character) {
      float wetK = uWet * (asphalt ? 1.0 : (grass ? 0.45 : 0.75));
      surf *= 1.0 - 0.32 * wetK;
      if (asphalt || (surfId == 2 && !filled)) {
        float puddle = smoothstep(0.55, 0.72, fbm3(wp.xz * 0.12 + 2.0)) * uWet;
        float fres = pow(1.0 - clamp(-rd.y, 0.0, 1.0), 4.0);
        vec3 refl = skyBase(reflect(rd, vec3(0.0, 1.0, 0.0)));
        float k = clamp(fres * 0.55 * wetK + puddle * 0.65, 0.0, 0.85);
        // ondinhas da chuva nas poças
        float rip = uRain * sin(length(fract(wp.xz * 0.7) - 0.5) * 40.0 - uTime * 9.0) * 0.06;
        surf = mix(surf, refl * (0.85 + rip), k);
      }
    }

    // ---- iluminação ambiente/sol (o cel-shading dá a forma, isto dá a hora do dia)
    float sunLit = smoothstep(0.46, 0.72, ndl);
    vec3 light = uAmbCol + uSunCol * sunLit;
    vec3 albedo = surf;
    col = surf * light;

    // ---- noite: postes, janelas, faróis de luz
    if (uNight > 0.02 && !(uNotebook > 0.5)) {
      vec3 add = vec3(0.0);
      for (int i = 0; i < 16; i++) {
        if (i >= uLampN) break;
        vec3 v = uLamps[i] - wp;
        float d2 = dot(v, v);
        float att = exp(-d2 / 110.0);
        float nl = max(dot(nW, v * inversesqrt(d2 + 1e-4)), 0.0);
        add += vec3(1.0, 0.74, 0.42) * att * (0.08 + 0.92 * nl);
      }
      // poças de luz amarelada dos postes (sódio), sem estourar
      col += albedo * min(add, vec3(1.1)) * 1.15 * uNight * mix(0.35, 1.0, clamp(nW.y, 0.0, 1.0));   // a luz cai no chão, fachada só pega um pouco
      if (tag == 7 && abs(nW.y) < 0.25 && d < 700.0) {
        float wl = windowLight(wp, nW);
        vec3 wc = mix(vec3(1.0, 0.82, 0.5), vec3(0.75, 0.88, 1.0), hash12(floor(wp.xz / 9.0)));
        col = mix(col, wc * 0.95, wl * uNight * 0.85);
      }
    }
    if (tag == 4) {
      // luminárias e lentes: acesas à noite / chuva escura
      float on = clamp(uNight * 1.3 + (uCloud - 0.7) * 1.5, 0.0, 1.0);
      col = mix(col, albedo * 1.6 + vec3(0.35, 0.28, 0.12), on);
    }

    // ---- neblina atmosférica (mais na chuva)
    float haze = smoothstep(160.0, 680.0, d) * (0.28 + 0.4 * uRain) + smoothstep(20.0, 260.0, d) * uRain * 0.35;
    col = mix(col, skyBase(rd), clamp(haze, 0.0, 0.85));

    // ---- oclusão de contato leve (4 amostras de profundidade já lidas)
    if (uDetail > 0.5 && d < 120.0) {
      float occ = max(0.0, d - linDepth(zl)) + max(0.0, d - linDepth(zr)) + max(0.0, d - linDepth(zu)) + max(0.0, d - linDepth(zd));
      float ao = 1.0 - clamp(occ * 0.14, 0.0, 0.18) * (1.0 - smoothstep(45.0, 120.0, d));
      col *= ao;
    }
  }

  // contorno de tinta (mais suave à noite)
  int eId = int(inkId + 0.5);
  vec3 outlineCol = baseInk(eId) * 0.22 + vec3(0.05, 0.06, 0.09);
  outlineCol *= mix(1.0, 0.35, uNight);
  float fadeE = mix(1.0, 0.38, smoothstep(40.0, 320.0, dFront));
  { int eTag = int((inkId - floor(inkId + 0.5)) * 16.0 + 0.5); if (eTag == 1 || eTag == 6) fadeE *= mix(0.8, 0.35, smoothstep(15.0, 90.0, dFront)); }   // folhagem: contorno leve
  col = mix(col, outlineCol, clamp(edge, 0.0, 1.0) * fadeE);

  // ---- chuva na tela (riscos inclinados em 2 camadas)
  if (uRain > 0.01) {
    vec2 ru = vec2(vUv.x * uAspect, vUv.y);
    float r = 0.0;
    for (int L = 0; L < 2; L++) {
      float sc2 = L == 0 ? 90.0 : 55.0;
      float sp = L == 0 ? 1.8 : 2.6;
      vec2 p = ru * vec2(sc2, sc2 * 0.07);
      p.x += p.y * 0.9 + uCamFwd.x * 2.0;
      p.y += uTime * sp * (L == 0 ? 6.0 : 8.0);
      vec2 id = floor(p); vec2 f = fract(p);
      float h = hash12(id + float(L) * 7.0);
      float line = 1.0 - smoothstep(0.02, 0.1, abs(f.x - h));
      line *= smoothstep(0.0, 0.35, f.y) * (1.0 - smoothstep(0.55, 1.0, f.y));
      r += line * step(1.0 - uRain * 0.75, hash12(id + 13.0)) * (L == 0 ? 0.55 : 0.8);
    }
    col = mix(col, vec3(0.86, 0.9, 0.96) * (0.45 + 0.55 * (1.0 - uNight)), clamp(r, 0.0, 1.0) * 0.55);
    col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))) * vec3(0.9, 0.95, 1.05), uRain * 0.18);
  }

  // efeitos de dano / flash / câmera lenta
  vec2 vc = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(0.36, 0.92, length(vc));
  col *= 1.0 - vig * (0.12 + 0.25 * uNight);
  float hurt = clamp(uHurt + uLowHp * (0.35 + 0.25 * sin(uTime * 6.0)), 0.0, 1.0);
  col = mix(col, uInks[1] * 0.88, hurt * vig * 0.78);
  col = mix(col, vec3(1.0, 0.99, 0.96), uFlash);
  float lum = dot(col, vec3(0.3, 0.5, 0.2));
  col = mix(col, vec3(lum) * vec3(0.80, 0.88, 1.0), uSlow * 0.55);
  gl_FragColor = vec4(col, 1.0);
}`;
