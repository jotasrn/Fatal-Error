import numpy as np, json, math, base64
d=json.load(open('scripts/brasilia_osm.json'))
f=d['frame']; lat0,lon0,kx,ky,ang=f['lat0'],f['lon0'],f['kx'],f['ky'],f['ang']
ca,sa=math.cos(ang),math.sin(ang); S=1/3.0
N=3601
hgt=np.fromfile('scripts/dem/S16W048.hgt',dtype='>i2').astype(np.float32).reshape(N,N)
hgt[hgt<-1000]=np.nan; med=float(np.nanmedian(hgt)); hgt=np.where(np.isnan(hgt),med,hgt)
LAT_N=-15.0; LON_W=-48.0; sd=1.0/3600.0
def elev(lat,lon):
    r=(LAT_N-lat)/sd; c=(lon-LON_W)/sd
    r=min(max(r,0),N-1.001); c=min(max(c,0),N-1.001)
    r0=int(r); c0=int(c); fr=r-r0; fc=c-c0
    return (hgt[r0,c0]*(1-fr)*(1-fc)+hgt[r0+1,c0]*fr*(1-fc)+hgt[r0,c0+1]*(1-fr)*fc+hgt[r0+1,c0+1]*fr*fc)
def eg(x,z):
    n=x/S; e=z/S; dx=e*ca-n*sa; dy=e*sa+n*ca
    return elev(lat0+dy/ky, lon0+dx/kx)
B=json.loads(open('src/levels/brasiliaData.js',encoding='utf-8').read().split('=',1)[1].rsplit(';',1)[0])['bounds']
MARGIN=40; STEP=12.0; VSCALE=1/3.0
minX=math.floor((B['minX']-MARGIN)/STEP)*STEP; maxX=math.ceil((B['maxX']+MARGIN)/STEP)*STEP
minZ=math.floor((B['minZ']-MARGIN)/STEP)*STEP; maxZ=math.ceil((B['maxZ']+MARGIN)/STEP)*STEP
nx=int(round((maxX-minX)/STEP))+1; nz=int(round((maxZ-minZ)/STEP))+1
datum=float(eg(-2.8,-1))
G=np.zeros((nz,nx),np.float32)
for j in range(nz):
    z=minZ+j*STEP
    for i in range(nx):
        x=minX+i*STEP
        G[j,i]=(eg(x,z)-datum)*VSCALE
# gaussian smooth (separable), sigma ~2 cells (~24u ~ 70m real)
def gauss1d(a,sig,axis):
    rad=int(sig*3); k=np.exp(-0.5*(np.arange(-rad,rad+1)/sig)**2); k/=k.sum()
    return np.apply_along_axis(lambda m: np.convolve(m,k,mode='same'),axis,a)
G=gauss1d(gauss1d(G,2.0,0),2.0,1)
q=np.clip(np.round(G*50),-32000,32000).astype('<i2')
b64=base64.b64encode(q.tobytes()).decode()
js=f'''// Campo de elevação de Brasília (DEM SRTM1 30m, tile S16W048) reprojetado p/ coords do jogo.
// Gerado por scripts/gen_elev2.py. Datum = Rodoviária ({datum:.1f} m) -> y=0. Escala vertical = {VSCALE:.4f} (proporção real).
// terrainHeight(x,z) devolve o deslocamento vertical do solo (unidades do jogo), suave, p/ relevo real.
const MINX={minX}, MINZ={minZ}, STEP={STEP}, NX={nx}, NZ={nz};
const _b="{b64}";
const _bin=Uint8Array.from(atob(_b),c=>c.charCodeAt(0));
const G=new Int16Array(_bin.buffer,_bin.byteOffset,NX*NZ);
export function terrainHeight(x,z){{
  let fx=(x-MINX)/STEP, fz=(z-MINZ)/STEP;
  if(fx<0)fx=0; else if(fx>NX-1.001)fx=NX-1.001;
  if(fz<0)fz=0; else if(fz>NZ-1.001)fz=NZ-1.001;
  const ix=fx|0, iz=fz|0, tx=fx-ix, tz=fz-iz, o=iz*NX+ix;
  const a=G[o], b=G[o+1], c=G[o+NX], e=G[o+NX+1];
  return ((a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+e*tx)*tz)/50;
}}
export const TERRAIN_INFO={{minX:MINX,minZ:MINZ,step:STEP,nx:NX,nz:NZ,datum:{datum:.1f},vscale:{VSCALE:.4f}}};
'''
open('src/levels/brasiliaElev.js','w',encoding='utf-8').write(js)
print('wrote brasiliaElev.js  nx,nz=',nx,nz,'bytes=',len(js))
print('range units:',round(float(G.min()),1),'..',round(float(G.max()),1))
# sanity via the just-written sampler logic (reimpl)
def th(x,z):
    fx=min(max((x-minX)/STEP,0),nx-1.001); fz=min(max((z-minZ)/STEP,0),nz-1.001)
    ix=int(fx); iz=int(fz); tx=fx-ix; tz=fz-iz; o=iz*nx+ix
    a=q[iz,ix]; b=q[iz,ix+1]; c=q[iz+1,ix]; e=q[iz+1,ix+1]
    return ((a*(1-tx)+b*tx)*(1-tz)+(c*(1-tx)+e*tx)*tz)/50
for name,(x,z) in {'Torre':(0.3,-387),'Rodoviaria':(-2.8,-1),'Congresso':(-1.8,697.7),'Praca3P':(-3.3,816.7)}.items():
    print(f'  {name:11} terrainH={th(x,z):+.2f} u')
