#!/usr/bin/env python3
"""Gera src/levels/brasiliaData.js a partir de dados reais do OpenStreetMap (scripts/brasilia_osm.json).

O JSON de entrada já vem em metros, num referencial girado: e = ao longo do Eixo Monumental
(leste positivo, da Torre de TV para o Congresso), n = perpendicular (norte / Asa Norte positivo),
origem na Rodoviária. Aqui convertemos para coordenadas do jogo (x = n*S, z = e*S: norte em +X, sem espelhar), resolvemos
os níveis das vias (viadutos, rampas, túneis e trincheiras), separamos pistas duplas que ficariam
sobrepostas, recortamos o chão onde há trincheira, calculamos colisores dos prédios e espalhamos
árvores, postes, paradas e pontos de spawn só onde não há via nem prédio.

Uso: python3 scripts/build_brasilia.py scripts/brasilia_osm.json src/levels/brasiliaData.js
Requer: shapely, numpy.  © OpenStreetMap contributors (ODbL)
"""
import json, math, sys, random
from collections import defaultdict
import numpy as np
from shapely.geometry import Polygon, LineString, Point, box as sbox
from shapely.ops import unary_union
from shapely.strtree import STRtree
from shapely.prepared import prep

random.seed(7)
SRC, OUT = sys.argv[1], sys.argv[2]
d = json.load(open(SRC))

S = 1 / 3          # escala horizontal (1 m do jogo = 3 m reais)
SH = 0.6           # escala vertical dos prédios
LW = 2.7           # largura de faixa no jogo
E1, E2, N1, N2 = -3800, 2850, -2200, 2200          # recorte do mapa (m reais)
NAV = dict(minX=-340, maxX=340, minZ=-470, maxZ=905)  # núcleo com malha de navegação (jogo)
H_UP, H_DOWN, RAMP = 6.5, -6.5, 40.0               # viaduto, túnel, comprimento de rampa (jogo)

def G(e, n): return (n * S, e * S)                 # real -> jogo (x, z)
BX1, BX2 = N1 * S, N2 * S
BZ1, BZ2 = E1 * S, E2 * S
r1 = lambda v: round(v, 1)

# ----------------------------------------------------------------------------- landmarks
# Objetos modelados à mão (não usam a planta do OSM). Coordenadas reais (e, n) e raio de exclusão.
def bbox_of(name, src='blds'):
    for b in d[src]:
        if b[1] == name:
            xs, ys = b[5][0::2], b[5][1::2]
            return (min(xs), max(xs), min(ys), max(ys))
    raise KeyError(name)

LM = {}
def lm(key, e, n, **kw):
    x, z = G(e, n); LM[key] = dict(x=r1(x), z=r1(z), **kw)

def lm_box(key, name, **kw):
    e1, e2, n1, n2 = bbox_of(name)
    x1, z1 = G(e1, n1); x2, z2 = G(e2, n2)
    lm(key, (e1 + e2) / 2, (n1 + n2) / 2, w=r1(abs(x2 - x1)), d=r1(abs(z2 - z1)), **kw)

lm_box('torre', 'Torre de TV')
lm_box('rodoviaria', 'Rodoviária do Plano Piloto')
lm_box('catedral', 'Catedral Metropolitana Nossa Senhora Aparecida')
lm_box('museu', 'Museu Nacional Honestino Guimarães')
lm_box('teatro', 'Teatro Nacional Cláudio Santoro')
lm_box('itamaraty', 'Palácio Itamaraty')
lm_box('justica', 'Palácio da Justiça')
lm_box('congresso', 'Congresso Nacional do Brasil')
lm_box('planalto', 'Palácio do Planalto')
lm_box('stf', 'Supremo Tribunal Federal')
lm_box('memorialjk', 'Memorial JK')
lm_box('dombosco', 'Santuário Dom Bosco')
lm_box('nilson', 'Arena BRB Nilson Nelson')
lm_box('panteao', 'Panteão da Pátria e da Libertade Tancredo Neves')
lm('mane', -2060, 560, r=48)
lm('praca3p', 2450, -10)
lm('esplanada', 1250, -5)
lm('igrejinha', -1857, -2085)

# prédios substituídos pelos modelos
REPLACED = {'Torre de TV', 'Rodoviária do Plano Piloto', 'Catedral Metropolitana Nossa Senhora Aparecida',
            'Museu Nacional Honestino Guimarães', 'Teatro Nacional Cláudio Santoro', 'Palácio Itamaraty',
            'Palácio da Justiça', 'Congresso Nacional do Brasil', 'Palácio do Planalto', 'Supremo Tribunal Federal',
            'Memorial JK', 'Santuário Dom Bosco', 'Arena BRB Nilson Nelson', 'Senado Federal', 'Câmara dos Deputados',
            'Palácio do Congresso Nacional Anexo', 'Panteão da Pátria e da Libertade Tancredo Neves',
            'Paróquia Nossa Senhora de Fátima'}
# zonas (jogo) onde nenhum prédio/árvore genérico entra: os modelos à mão ocupam o espaço
def zone_poly(k, pad=2.0, rad=None):
    L = LM[k]
    if rad: return Point(L['x'], L['z']).buffer(rad)
    return sbox(L['x'] - L['w'] / 2 - pad, L['z'] - L['d'] / 2 - pad, L['x'] + L['w'] / 2 + pad, L['z'] + L['d'] / 2 + pad)
ZONES = unary_union([zone_poly('mane', rad=50), zone_poly('torre', rad=26), zone_poly('catedral', rad=19), zone_poly('museu', pad=3),
                     zone_poly('teatro', pad=3), zone_poly('itamaraty', pad=5), zone_poly('justica', pad=5), zone_poly('congresso', pad=4),
                     zone_poly('planalto', pad=4), zone_poly('stf', pad=4), zone_poly('memorialjk', pad=6), zone_poly('dombosco', pad=3),
                     zone_poly('nilson', pad=3), zone_poly('rodoviaria', pad=1), zone_poly('igrejinha', rad=10)])

# ----------------------------------------------------------------------------- vias
DRIVE = {'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
         'residential', 'unclassified', 'living_street'}
RANK = {'trunk': 6, 'trunk_link': 5, 'primary': 5, 'primary_link': 4, 'secondary': 4, 'secondary_link': 3,
        'tertiary': 3, 'tertiary_link': 2, 'residential': 1, 'unclassified': 1, 'living_street': 1, 'service': 0, 'pedestrian': 0}
SPEED = {'trunk': 21, 'trunk_link': 12, 'primary': 17, 'primary_link': 11, 'secondary': 14, 'secondary_link': 10,
         'tertiary': 12, 'tertiary_link': 9, 'residential': 8, 'unclassified': 9, 'living_street': 6}

def default_lanes(cls, oneway):
    if cls == 'trunk': return 3 if oneway else 4
    if cls in ('primary', 'secondary'): return 2 if oneway else 4
    if cls == 'tertiary': return 2 if oneway else 2
    if cls.endswith('_link'): return 1
    return 1 if oneway else 2

roads = []
for cls, name, ow, lanes, layer, flags, pts, wid in d['roads']:
    P = [G(pts[i], pts[i + 1]) for i in range(0, len(pts), 2)]
    if len(P) < 2: continue
    oneway = 1 if ow in ('yes', 'true', '1') else -1 if ow == '-1' else 0
    if flags & 4: oneway = 1                     # rotatória
    if oneway == -1: P = P[::-1]; oneway = 1
    bridge, tunnel = bool(flags & 1), bool(flags & 2)
    if cls == 'pedestrian': nl, width = 0, 3.2
    elif cls == 'service': nl, width = 0, 4.0
    else:
        nl = lanes if lanes > 0 else default_lanes(cls, oneway)
        nl = max(1, min(nl, 4 if oneway else 6))
        if not oneway and nl % 2: nl += 1
        width = nl * LW
    roads.append(dict(cls=cls, name=name, oneway=oneway, lanes=nl, width=width, layer=layer, bridge=bridge, tunnel=tunnel, pts=P, wid=wid))

# vias de serviço/estacionamento que atravessariam os modelos à mão saem
roads = [r for r in roads if not (r['cls'] in ('service', 'pedestrian', 'residential') and LineString(r['pts']).intersects(ZONES))]

key = lambda p: (round(p[0], 2), round(p[1], 2))
node_ways = defaultdict(list)
for i, r in enumerate(roads):
    for j, p in enumerate(r['pts']): node_ways[key(p)].append((i, j))

# --- separação de pistas duplas (as duas mãos do Eixão, da W3, ...) que ficariam encavaladas na escala do jogo
def seg_dir(P, j):
    a = P[max(0, j - 1)]; b = P[min(len(P) - 1, j + 1)]
    dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz) or 1
    return dx / L, dz / L
one = [i for i, r in enumerate(roads) if r['oneway'] and r['lanes'] > 0]
for it in range(4):
    segs, owner = [], []
    for i in one:
        P = roads[i]['pts']
        for j in range(len(P) - 1): segs.append(LineString([P[j], P[j + 1]])); owner.append((i, j))
    tree = STRtree(segs)
    disp = defaultdict(lambda: [0.0, 0.0, 0])
    for i in one:
        r = roads[i]; P = r['pts']
        for j, p in enumerate(P):
            tx, tz = seg_dir(P, j); nx, nz = tz, -tx
            pt = Point(p)
            for k in tree.query(pt.buffer(r['width'] / 2 + 6.5)):
                oi, oj = owner[k]
                if oi == i: continue
                o = roads[oi]
                if o['layer'] != r['layer'] or o['bridge'] != r['bridge'] or o['tunnel'] != r['tunnel']: continue
                Q = o['pts']; ux, uz = Q[oj + 1][0] - Q[oj][0], Q[oj + 1][1] - Q[oj][1]; ul = math.hypot(ux, uz) or 1
                if (ux * tx + uz * tz) / ul > -0.85: continue        # só mãos opostas e paralelas
                need = (r['width'] + o['width']) / 2 + 0.8
                dist = segs[k].distance(pt)
                if dist >= need: continue
                # de que lado está a outra pista?
                cp = segs[k].interpolate(segs[k].project(pt))
                side = (cp.x - p[0]) * nx + (cp.y - p[1]) * nz
                push = (need - dist) / 2 * (-1 if side > 0 else 1)
                D = disp[key(p)]; D[0] += nx * push; D[1] += nz * push; D[2] += 1
                break
    moved = 0
    for i, r in enumerate(roads):
        NP = []
        for p in r['pts']:
            D = disp.get(key(p))
            if D and D[2]: NP.append((p[0] + D[0] / D[2] * 0.9, p[1] + D[1] / D[2] * 0.9)); moved += 1
            else: NP.append(p)
        r['pts'] = NP
    node_ways = defaultdict(list)
    for i, r in enumerate(roads):
        for j, p in enumerate(r['pts']): node_ways[key(p)].append((i, j))
    print('separação de pistas, passada', it, 'vértices movidos', moved)

# --- níveis: viadutos (+), túneis (-) e rampas entre eles
fixed = {}
for i, r in enumerate(roads):
    if r['bridge'] or (r['layer'] > 0 and r['cls'] in DRIVE):
        h = H_UP if r['bridge'] else 0
        if h:
            for p in r['pts']: fixed[key(p)] = max(fixed.get(key(p), 0), h)
    if r['tunnel']:
        for p in r['pts']: fixed[key(p)] = min(fixed.get(key(p), 0), H_DOWN)
# grafo de vértices: a rampa só se propaga pela continuação da própria via (mesmo nome, ou alças),
# nunca para uma avenida de outro nome/maior hierarquia (senão a N1 "afundava" junto com a alça do túnel)
def fam(name):
    for t in ('Eixo Rodoviário', 'Eixo W', 'Exio W', 'Eixo L', 'W3', 'L2', 'L4', 'N1', 'S1', 'N2', 'S2'):
        if t in name: return t
    return name
adj = defaultdict(list)
for wi, r in enumerate(roads):
    P = r['pts']
    for j in range(len(P) - 1):
        a, b = key(P[j]), key(P[j + 1]); L = math.dist(P[j], P[j + 1])
        adj[a].append((b, L, wi)); adj[b].append((a, L, wi))
src_way = {}
for i, r in enumerate(roads):
    if r['bridge'] or r['tunnel']:
        for p in r['pts']: src_way.setdefault(key(p), i)
def can_enter(from_way, to_way):
    A, B = roads[from_way], roads[to_way]
    if B['bridge'] or B['tunnel']: return True
    if B['cls'].endswith('_link') or B['cls'] in ('service', 'pedestrian'): return RANK.get(B['cls'], 0) <= RANK.get(A['cls'], 0) + 1
    if fam(A['name']) and fam(A['name']) == fam(B['name']): return True
    return RANK.get(B['cls'], 0) < RANK.get(A['cls'], 0) and not B['name']
import heapq
height = {}
node_w = defaultdict(set)
for wi, r in enumerate(roads):
    for p in r['pts']: node_w[key(p)].add(wi)
def is_anchor(k, via):
    # nó que encosta numa avenida no nível do chão que não faz parte desta rampa: fica em 0
    for w in node_w[k]:
        if w == via: continue
        R_ = roads[w]
        if R_['bridge'] or R_['tunnel']: continue
        if not can_enter(via, w): return True
    return False
for sign in (1, -1):
    best = {}
    pq = []
    for k, h in fixed.items():
        if h * sign > 0: best[k] = 0.0; heapq.heappush(pq, (0.0, k, h, src_way.get(k, -1)))
    src, anchors = {}, {}
    while pq:
        dd, k, h, way = heapq.heappop(pq)
        if dd > best.get(k, 1e9) + 1e-9: continue
        src[k] = (dd, h)
        if k not in fixed and way >= 0 and is_anchor(k, way): anchors[k] = dd; continue
        for nb, L, wi in adj[k]:
            nd = dd + L
            if nd >= RAMP or nb in fixed: continue
            if wi != way and way >= 0 and not can_enter(way, wi): continue
            if nd < best.get(nb, 1e9): best[nb] = nd; heapq.heappush(pq, (nd, nb, h, wi))
    # distância de volta até a âncora mais próxima (dentro da área da rampa)
    da = {k: 0.0 for k in anchors}
    pq = [(0.0, k) for k in anchors]
    while pq:
        dd, k = heapq.heappop(pq)
        if dd > da.get(k, 1e9): continue
        for nb, L, wi in adj[k]:
            if nb not in src or nb in fixed: continue
            nd = dd + L
            if nd < da.get(nb, 1e9): da[nb] = nd; heapq.heappush(pq, (nd, nb))
    for k, (dd, h) in src.items():
        if k in anchors: v = 0.0
        elif k in da and dd + da[k] < RAMP * 1.3: v = h * da[k] / (dd + da[k])
        else: v = h * max(0.0, 1 - dd / RAMP)
        if abs(v) > abs(height.get(k, 0)) or k in anchors and k not in height: height[k] = v
        if k in anchors: height[k] = 0.0
for k, h in fixed.items(): height[k] = h
for r in roads:
    r['h'] = [round(height.get(key(p), 0.0), 2) for p in r['pts']]

# ----------------------------------------------------------------------------- recorte do chão (trincheiras abertas)
cuts = []
for r in roads:
    if r['tunnel']: continue
    P, H = r['pts'], r['h']
    for j in range(len(P) - 1):
        if min(H[j], H[j + 1]) < -0.35:
            cuts.append(LineString([P[j], P[j + 1]]).buffer(r['width'] / 2 + 1.4, cap_style=2))
CUT = unary_union(cuts) if cuts else Polygon()
# o chão vira retângulos: grade de 1 m só ao redor das trincheiras, blocos grandes no resto
ground = []
if not CUT.is_empty:
    cx1, cz1, cx2, cz2 = [math.floor(v) - 1 if i < 2 else math.ceil(v) + 1 for i, v in enumerate(CUT.bounds)]
    CS = 1.0
    nx_, nz_ = int((cx2 - cx1) / CS), int((cz2 - cz1) / CS)
    pc = prep(CUT)
    mask = np.zeros((nz_, nx_), dtype=bool)
    for iz in range(nz_):
        for ix in range(nx_):
            mask[iz, ix] = pc.contains(Point(cx1 + (ix + 0.5) * CS, cz1 + (iz + 0.5) * CS))
    # retângulos de chão dentro da caixa (fora do recorte), por faixas e fusão vertical
    runs_prev = {}
    rects = []
    for iz in range(nz_):
        row = mask[iz]; runs = []; ix = 0
        while ix < nx_:
            if row[ix]: ix += 1; continue
            s = ix
            while ix < nx_ and not row[ix]: ix += 1
            runs.append((s, ix))
        cur = {}
        for rr in runs:
            if rr in runs_prev: cur[rr] = runs_prev[rr]; cur[rr][3] = iz + 1
            else: cur[rr] = [rr[0], rr[1], iz, iz + 1]; rects.append(cur[rr])
        runs_prev = cur
    for a, b, z0, z1 in rects:
        ground.append([r1(cx1 + a * CS), r1(cz1 + z0 * CS), r1(cx1 + b * CS), r1(cz1 + z1 * CS)])
    # resto do mapa em 4 blocos
    for rx1, rz1, rx2, rz2 in ((BX1, BZ1, BX2, cz1), (BX1, cz2, BX2, BZ2), (BX1, cz1, cx1, cz2), (cx2, cz1, BX2, cz2)):
        if rx2 > rx1 and rz2 > rz1: ground.append([r1(rx1), r1(rz1), r1(rx2), r1(rz2)])
    # piso e muros das trincheiras
    cut_floor = []
    road_tree_segs, road_tree_h = [], []
    for r in roads:
        P, H = r['pts'], r['h']
        for j in range(len(P) - 1):
            if min(H[j], H[j + 1]) < -0.2: road_tree_segs.append(LineString([P[j], P[j + 1]])); road_tree_h.append((H[j], H[j + 1]))
    rtree = STRtree(road_tree_segs)
    def floor_h(x, z):
        pt = Point(x, z); best, bh = 1e9, 0
        for k in rtree.query(pt.buffer(14)):
            s = road_tree_segs[k]; dd = s.distance(pt)
            if dd < best:
                t = s.project(pt, normalized=True); h0, h1 = road_tree_h[k]; best, bh = dd, h0 + (h1 - h0) * t
        return bh
    # pisos: cada linha de células recortadas vira trechos com altura quantizada
    for iz in range(nz_):
        ix = 0
        while ix < nx_:
            if not mask[iz, ix]: ix += 1; continue
            s = ix; hq = round(floor_h(cx1 + (ix + 0.5) * CS, cz1 + (iz + 0.5) * CS) * 4) / 4
            ix += 1
            while ix < nx_ and mask[iz, ix]:
                h2 = round(floor_h(cx1 + (ix + 0.5) * CS, cz1 + (iz + 0.5) * CS) * 4) / 4
                if h2 != hq: break
                ix += 1
            cut_floor.append([r1(cx1 + s * CS), r1(cz1 + iz * CS), r1(cx1 + ix * CS), r1(cz1 + (iz + 1) * CS), hq])
else:
    ground = [[r1(BX1), r1(BZ1), r1(BX2), r1(BZ2)]]
    cut_floor = []

# muros das trincheiras: contorno do recorte, menos onde a via chega no nível do chão ou cruza o contorno
drive_buf = unary_union([LineString(r['pts']).buffer(r['width'] / 2 + 0.3) for r in roads if r['lanes'] > 0])
pdrive = prep(drive_buf)
cut_walls = []
if not CUT.is_empty:
    geoms = [CUT] if CUT.geom_type == 'Polygon' else list(CUT.geoms)
    for g in geoms:
        for ring in [g.exterior] + list(g.interiors):
            L = ring.length; n = max(2, int(L / 1.0))
            run = []
            def flush():
                if len(run) > 1: cut_walls.append([v for p in run for v in (r1(p[0]), r1(p[1]), p[2])])
            for k in range(n + 1):
                p = ring.interpolate(k / n, normalized=True)
                fh = floor_h(p.x, p.y)
                if fh > -0.6 or pdrive.contains(p):
                    flush(); run = []; continue
                run.append((p.x, p.y, round(fh, 2)))
            flush()

# ----------------------------------------------------------------------------- prédios
def height_of(b, area_real):
    btype, name, lv, h, amen = b[0], b[1], b[2], b[3], b[4]
    if h and h > 2: hr = h
    elif lv: hr = lv * 3.1 + 1.5
    elif btype in ('house', 'residential', 'apartments'): hr = 21 if area_real > 350 else 6
    elif btype in ('commercial', 'retail', 'office'): hr = 10 if area_real > 1500 else 7
    elif btype in ('roof', 'guardhouse', 'portaria', 'service', 'construction'): hr = 4
    else: hr = 3.5 if area_real < 60 else 7 if area_real < 500 else 12 if area_real < 3000 else 18
    return max(3.0, min(hr, 115)) * SH

def style_of(b):
    n = b[1]; t = b[0]
    if 'Ministério' in n or 'Ministerio' in n: return 'min'
    if 'Conjunto Nacional' in n: return 'cn'
    if 'Banco Central' in n: return 'bc'
    if 'CONIC' in n or 'Boulevard' in n: return 'conic'
    if t in ('residential', 'apartments'): return 'res'
    if t in ('house',): return 'house'
    if t in ('school', 'university', 'hospital', 'church', 'public', 'civic', 'government'): return 'civ'
    return 'gen'

def in_wings(x, z):  # superquadras: longe do Eixo
    return abs(x) > 200

blds, bcol = [], []
road_union = unary_union([LineString(r['pts']).buffer(r['width'] / 2 + 0.4) for r in roads if r['lanes'] > 0 or r['cls'] == 'service'])
proad = prep(road_union)
footprints = []
src_b = [b for b in d['blds']]
for b in src_b:
    if b[1] in REPLACED: continue
    ring = [G(b[5][i], b[5][i + 1]) for i in range(0, len(b[5]), 2)]
    if len(ring) < 3: continue
    P = Polygon(ring)
    if not P.is_valid: P = P.buffer(0)
    if P.is_empty or P.geom_type != 'Polygon': continue
    area_real = P.area / (S * S)
    c = P.centroid
    if not (BX1 + 3 < c.x < BX2 - 3 and BZ1 + 3 < c.y < BZ2 - 3): continue
    if ZONES.contains(c): continue
    if area_real < 25: continue
    h = height_of(b, area_real)
    st = style_of(b)
    mr = P.minimum_rotated_rectangle
    rect = P.area / max(mr.area, 1e-6) > 0.86
    pil = 0.0
    if rect:
        xs, zs = mr.exterior.coords.xy
        e0 = (xs[1] - xs[0], zs[1] - zs[0]); e1 = (xs[2] - xs[1], zs[2] - zs[1])
        l0, l1 = math.hypot(*e0), math.hypot(*e1)
        if l0 >= l1: Lg, Dp, ang = l0, l1, math.atan2(e0[1], e0[0])
        else: Lg, Dp, ang = l1, l0, math.atan2(e1[1], e1[0])
        # prédios finos na escala do jogo ganham espessura mínima (sem invadir via)
        Dp2 = max(Dp, min(6.0, Lg * 0.5)) if st in ('res', 'min', 'gen', 'civ') else Dp
        if Dp2 > Dp:
            cand = Polygon([(c.x + math.cos(ang) * u * Lg / 2 - math.sin(ang) * v * Dp2 / 2, c.y + math.sin(ang) * u * Lg / 2 + math.cos(ang) * v * Dp2 / 2) for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
            if not proad.intersects(cand): Dp = Dp2; P = cand
        if st == 'res' and in_wings(c.x, c.y) and h > 9 and Lg > 12: pil = 2.6
        blds.append(['r', st, r1(c.x), r1(c.y), r1(Lg), r1(Dp), round(ang, 4), r1(h), pil])
    else:
        coords = list(P.exterior.coords)[:-1]
        blds.append(['p', st, r1(h), [v for p in coords for v in (r1(p[0]), r1(p[1]))]])
    footprints.append(P)
    # colisor: fatias de 2 m ao longo do eixo mais alinhado
    if P.area < 3: continue
    x1, z1, x2, z2 = P.bounds
    boxes = []
    for axis in (0, 1):
        out = []
        lo, hi = (x1, x2) if axis == 0 else (z1, z2)
        n = max(1, int(math.ceil((hi - lo) / 2.0)))
        for k in range(n):
            a = lo + (hi - lo) * k / n; bb = lo + (hi - lo) * (k + 1) / n
            sl = sbox(a, z1 - 1, bb, z2 + 1) if axis == 0 else sbox(x1 - 1, a, x2 + 1, bb)
            ii = P.intersection(sl)
            if ii.is_empty: continue
            out.append(ii.bounds)
        area = sum((q[2] - q[0]) * (q[3] - q[1]) for q in out)
        boxes.append((area, out))
    area, out = min(boxes, key=lambda t: t[0])
    # funde fatias vizinhas iguais
    merged = []
    for q in out:
        if merged and abs(merged[-1][1] - q[1]) < 0.05 and abs(merged[-1][3] - q[3]) < 0.05 and abs(merged[-1][2] - q[0]) < 0.05: merged[-1] = (merged[-1][0], merged[-1][1], q[2], q[3])
        elif merged and abs(merged[-1][0] - q[0]) < 0.05 and abs(merged[-1][2] - q[2]) < 0.05 and abs(merged[-1][3] - q[1]) < 0.05: merged[-1] = (merged[-1][0], merged[-1][1], merged[-1][2], q[3])
        else: merged.append(q)
    for q in merged: bcol.append([r1(q[0]), r1(q[1]), r1(q[2]), r1(q[3]), r1(pil), r1(h)])
BLD = unary_union(footprints)
print('prédios', len(blds), 'colisores', len(bcol))

water = []
for w in d['water']:
    ring = [G(w[1][i], w[1][i + 1]) for i in range(0, len(w[1]), 2)]
    if len(ring) < 3: continue
    P = Polygon(ring).buffer(0)
    if P.is_empty or P.geom_type != 'Polygon' or P.area < 4: continue
    c = P.centroid
    if not (BX1 < c.x < BX2 and BZ1 < c.y < BZ2): continue
    water.append([v for p in list(P.exterior.coords)[:-1] for v in (r1(p[0]), r1(p[1]))])
WATER = unary_union([Polygon([(w[i], w[i + 1]) for i in range(0, len(w), 2)]).buffer(0) for w in water]) if water else Polygon()

# ----------------------------------------------------------------------------- decoração: só em área livre
all_roads = unary_union([LineString(r['pts']).buffer(r['width'] / 2 + 1.6) for r in roads])
blocked = prep(unary_union([all_roads, BLD.buffer(2.2), WATER.buffer(1), ZONES, CUT.buffer(2) if not CUT.is_empty else Polygon()]))

def free(x, z): return not blocked.contains(Point(x, z))

def in_nav(x, z, pad=0): return NAV['minX'] + pad < x < NAV['maxX'] - pad and NAV['minZ'] + pad < z < NAV['maxZ'] - pad

trees = []
for gx in np.arange(BX1 + 6, BX2 - 6, 7.0):
    for gz in np.arange(BZ1 + 6, BZ2 - 6, 7.0):
        x, z = gx + random.uniform(-3, 3), gz + random.uniform(-3, 3)
        wing = abs(x) > 230
        esplanada = abs(x) < 70 and z > 40
        p = 0.38 if wing else 0.06 if esplanada else 0.16
        if random.random() > p or not free(x, z): continue
        trees.append([r1(x), r1(z), random.randrange(6)])
print('árvores', len(trees))

# postes ao longo das vias principais (no nível do chão), paradas de ônibus nos corredores
lamps, stops = [], []
BUS_RE = ('W3', 'L2', 'Eixo W', 'Eixo L', 'N1', 'S1', 'N2', 'S2', 'W1', 'L1', 'Exio W')
junction = {k for k, v in node_ways.items() if len(v) > 2}
for i, r in enumerate(roads):
    if r['lanes'] == 0: continue
    P, H = r['pts'], r['h']
    ls = LineString(P); L = ls.length
    if RANK.get(r['cls'], 0) >= 4:
        sides = (1,) if r['oneway'] else (1, -1)
        k = 6.0
        while k < L - 4:
            p = ls.interpolate(k); q = ls.interpolate(min(L, k + 0.5)); tx, tz = q.x - p.x, q.y - p.y; tl = math.hypot(tx, tz) or 1
            for sd in sides:
                x, z = p.x - tz / tl * sd * (r['width'] / 2 + 2.2), p.y + tx / tl * sd * (r['width'] / 2 + 2.2)
                if free(x, z) and abs(height.get(key((p.x, p.y)), 0)) < 0.1:
                    hh = 0
                    lamps.append([r1(x), r1(z), round(math.atan2(tz / tl * sd, -tx / tl * sd), 2)])
            k += 34
    if any(t in r['name'] for t in BUS_RE) and RANK.get(r['cls'], 0) >= 3 and not r['bridge'] and not r['tunnel']:
        k = 40.0
        while k < L - 30:
            p = ls.interpolate(k); q = ls.interpolate(k + 1); tx, tz = q.x - p.x, q.y - p.y; tl = math.hypot(tx, tz) or 1
            tx, tz = tx / tl, tz / tl
            near_j = any(math.dist((p.x, p.y), jk) < 22 for jk in junction if abs(jk[0] - p.x) < 25 and abs(jk[1] - p.y) < 25)
            hp = 0
            if not near_j:
                sides = (1,) if r['oneway'] else (1, -1)
                for sd in sides:
                    # lado direito de quem trafega no sentido (sd=1) ou contrário (sd=-1)
                    nx, nz = -tz * sd, tx * sd
                    off = r['width'] / 2 + 1.8
                    x, z = p.x + nx * off, p.y + nz * off
                    if free(x, z) and free(x + nx * 2.4, z + nz * 2.4):
                        stops.append(dict(x=r1(x), z=r1(z), y=0, nx=round(nx, 3), nz=round(nz, 3), dx=round(tx * sd, 3), dz=round(tz * sd, 3), road=i, name=r['name']))
            k += 115
print('postes', len(lamps), 'paradas', len(stops))

# pontos de spawn/itens no núcleo jogável, em chão livre
spawns, pickups = [], []
for gx in np.arange(NAV['minX'] + 8, NAV['maxX'] - 8, 26):
    for gz in np.arange(NAV['minZ'] + 8, NAV['maxZ'] - 8, 26):
        x, z = gx + random.uniform(-8, 8), gz + random.uniform(-8, 8)
        if free(x, z): (spawns if random.random() < 0.7 else pickups).append([r1(x), r1(z)])
print('spawns', len(spawns), 'pickups', len(pickups))

# ----------------------------------------------------------------------------- grafo de trânsito
nid = {}
def node_id(p):
    k = key(p)
    if k not in nid: nid[k] = len(nid)
    return nid[k]
edges = []   # (a, b, roadIndex, forward)
for i, r in enumerate(roads):
    if r['cls'] not in DRIVE: continue
    a, b = node_id(r['pts'][0]), node_id(r['pts'][-1])
    edges.append((a, b, i, 1))
    if not r['oneway']: edges.append((b, a, i, -1))
nodes_xy = [None] * len(nid)
for k, v in nid.items(): nodes_xy[v] = k
out_e, in_e = defaultdict(list), defaultdict(list)
for ei, (a, b, i, fw) in enumerate(edges): out_e[a].append(ei); in_e[b].append(ei)
deg = defaultdict(int)
for (a, b, i, fw) in edges: deg[a] += 1; deg[b] += 1
def at_border(k):
    x, z = k
    return x < BX1 + 25 or x > BX2 - 25 or z < BZ1 + 25 or z > BZ2 - 25
sources = {n for n in range(len(nid)) if at_border(nodes_xy[n]) and out_e[n] and not in_e[n]}
sinks = {n for n in range(len(nid)) if at_border(nodes_xy[n]) and in_e[n] and not out_e[n]}
# só fica o que dá para entrar e sair (nada de carro preso em beco)
def reach(starts, fwd):
    seen = set(starts); st = list(starts)
    while st:
        n = st.pop()
        for ei in (out_e[n] if fwd else in_e[n]):
            m = edges[ei][1] if fwd else edges[ei][0]
            if m not in seen: seen.add(m); st.append(m)
    return seen
ok_nodes = reach(sources, True) & reach(sinks, False)
keep = [ei for ei, (a, b, i, fw) in enumerate(edges) if a in ok_nodes and b in ok_nodes]
# laços fechados sem saída (ex.: rotatórias isoladas) também ficam se forem fortemente conexos com o resto
remap = {old: new for new, old in enumerate(keep)}
T_edges = []
for old in keep:
    a, b, i, fw = edges[old]
    T_edges.append([a, b, i, fw])
print('trânsito: arestas', len(T_edges), 'de', len(edges), 'entradas', len(sources & ok_nodes), 'saídas', len(sinks & ok_nodes))

# paradas: associa à aresta e posição s ao longo dela (para o ônibus parar)
for st in stops:
    st['edges'] = []
    r = roads[st['road']]; ls = LineString(r['pts'])
    s = ls.project(Point(st['x'] - st['nx'] * (r['width'] / 2 + 1.8), st['z'] - st['nz'] * (r['width'] / 2 + 1.8)))
    for ti, (a, b, i, fw) in enumerate(T_edges):
        if i != st['road']: continue
        # o ponto está do lado direito deste sentido?
        if fw == 1 and (st['dx'] * (r['pts'][-1][0] - r['pts'][0][0]) + st['dz'] * (r['pts'][-1][1] - r['pts'][0][1])) < 0: continue
        if fw == -1 and (st['dx'] * (r['pts'][-1][0] - r['pts'][0][0]) + st['dz'] * (r['pts'][-1][1] - r['pts'][0][1])) > 0: continue
        st['edges'].append([ti, r1(s if fw == 1 else ls.length - s)])
stops = [s for s in stops if s['edges']]

# ----------------------------------------------------------------------------- saída
names = sorted({r['name'] for r in roads if r['name']})
name_ix = {n: i for i, n in enumerate(names)}
CLS = ['trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'service', 'pedestrian']
R_out = []
for r in roads:
    flags = (1 if r['oneway'] else 0) | (2 if r['bridge'] else 0) | (4 if r['tunnel'] else 0)
    pts = []
    for p, h in zip(r['pts'], r['h']): pts += [r1(p[0]), round(h, 2), r1(p[1])]
    R_out.append([CLS.index(r['cls']), name_ix.get(r['name'], -1), flags, r['lanes'], r1(r['width']), pts])

out = dict(
    note='Gerado por scripts/build_brasilia.py a partir de dados © OpenStreetMap contributors (ODbL). Não edite à mão.',
    S=S, bounds=dict(minX=r1(BX1), maxX=r1(BX2), minZ=r1(BZ1), maxZ=r1(BZ2)), nav=NAV,
    cls=CLS, speed=SPEED, names=names, roads=R_out, ground=ground, cutFloor=cut_floor, cutWalls=cut_walls,
    blds=blds, bcol=bcol, water=water, trees=trees, lamps=lamps,
    stops=[[s['x'], s['z'], s['nx'], s['nz'], s['dx'], s['dz'], s['edges']] for s in stops],
    spawns=spawns, pickups=pickups, landmarks=LM,
    tnodes=[[r1(k[0]), r1(k[1])] for k in nodes_xy], tedges=T_edges,
    tsources=sorted(sources & ok_nodes), tsinks=sorted(sinks & ok_nodes),
)
js = json.dumps(out, separators=(',', ':'), ensure_ascii=False)
open(OUT, 'w', encoding='utf-8').write('// ' + out['note'] + '\nexport const BRASILIA = ' + js + ';\n')
print('saída', OUT, len(js) // 1024, 'KB')
