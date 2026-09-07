/* ============================================================================
   Maquete 3D da casa — Aparecida de Goiânia
   ----------------------------------------------------------------------------
   Levanta em três dimensões a MESMA planta da aba ao lado: lê o array AMBIENTES
   e as constantes do lote, então o que o Renan arrastar na planta aparece aqui.

   A arquitetura vem do vídeo da casa de referência (WhatsApp Video 2026-09-04):
   volume reto de laje plana com platibanda, grafiato cinza escuro por fora,
   parede interna branca, porcelanato bege claro de formato grande, esquadria
   preta, ripado de madeira na sala, corredor lateral de pedrisco com placas de
   concreto e muro alto claro com concertina.

   Depende de three.min.js (r128), baixado para esta pasta para o app funcionar
   sem internet. Sem ele, a aba mostra um aviso em vez de quebrar.

   SISTEMA DE COORDENADAS
     plano da planta          mundo 3D
     x (rua → fundo)    →     X
     y (corredor → divisa) →  Z
     altura                →  Y
   ========================================================================== */

(function(){
'use strict';

const V3 = window.Maquete3D = {};

/* ---- medidas verticais, em metros ------------------------------------- */
const H = {
  piso:      0.15,   // baldrame acima do terreno
  pd:        2.80,   // pé-direito
  laje:      0.15,
  platib:    0.55,   // platibanda acima da laje — é o que dá o volume reto
  peitoril:  1.10,   // janela de quarto e sala
  janela:    1.20,
  basc:      1.70,   // basculante de banheiro
  bascAlt:   0.50,
  porta:     2.10,
  parede:    0.15,   // espessura
  muro:      2.60,
  garagem:   2.80
};

/* ---- paleta tirada do vídeo -------------------------------------------- */
const C = {
  grafiato:  0x4a4d50,
  grafClaro: 0x8e8f8b,
  interna:   0xf4f2ee,
  teto:      0xfbfaf8,
  piso:      0xd9cfc0,
  pisoJunta: 0xcfc4b3,
  madeira:   0x8a5a33,
  preto:     0x1b1c1e,
  granito:   0x232427,
  pedrisco:  0x6f6f6b,
  placa:     0xbdb9ae,
  grama:     0x6b8f4e,
  muro:      0xa8a8a2,
  vidro:     0x9fb8c4,
  bancada:   0xf2f0ec,
  metal:     0x3a3d40,
  terreno:   0xbdb6a8,
  sofa:      0xcfc7c0
};

let ren, cena, cam, raf=null, caixa=null, pronto=false;
let grupos = {};          // por nome, para ligar e desligar
let etapaOn = {1:true,2:true,3:true,4:true};
let togOn   = {teto:false, mob:true, muro:true, futuro:false};

/* ---- órbita própria: girar, deslocar e aproximar ----------------------- */
const orb = { alvo:new THREE.Vector3(12.6,1.2,3.2), dist:26, theta:-0.9, phi:0.95 };

function aplicaCamera(){
  const s=Math.sin(orb.phi), x=orb.dist*s*Math.cos(orb.theta),
        z=orb.dist*s*Math.sin(orb.theta), y=orb.dist*Math.cos(orb.phi);
  cam.position.set(orb.alvo.x+x, orb.alvo.y+y, orb.alvo.z+z);
  cam.lookAt(orb.alvo);
}

/* ---------------------------------------------------------------- helpers */
const mat = (cor,o={}) => new THREE.MeshLambertMaterial(Object.assign({color:cor},o));

/* Um bloco alinhado aos eixos, dado em coordenadas de PLANTA.
   x0,x1 = da rua para o fundo · z0,z1 = do corredor para a divisa */
function bloco(g, x0,z0, x1,z1, y0,y1, material, dados){
  const dx=Math.abs(x1-x0), dz=Math.abs(z1-z0), dy=Math.abs(y1-y0);
  if(dx<1e-4||dz<1e-4||dy<1e-4) return null;
  const m=new THREE.Mesh(new THREE.BoxGeometry(dx,dy,dz), material);
  m.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);
  if(dados) Object.assign(m.userData,dados);
  g.add(m); return m;
}

/* Uma parede com buracos de verdade. `eixo` diz se ela corre em X ou em Z;
   `vaos` são [de, ate, base, topo] na direção em que ela corre.
   Sem isto as janelas e portas seriam adesivos na parede, e a maquete não
   serviria para conferir onde bate a luz.

   A parede é feita em DUAS CASCAS de meia espessura, porque o ExtrudeGeometry
   pinta as duas faces com o mesmo material — e a casa do vídeo é grafiato
   cinza escuro por fora e branca por dentro. `fora` diz de que lado é a rua:
   -1 = para o lado de menor coordenada, +1 = para o de maior. */
function parede(g, eixo, fixo, a, b, base, topo, vaos, matExt, matInt, dados, fora){
  const forma=new THREE.Shape();
  forma.moveTo(a,base); forma.lineTo(b,base); forma.lineTo(b,topo); forma.lineTo(a,topo);
  (vaos||[]).forEach(([v0,v1,y0,y1])=>{
    const h=new THREE.Path();
    h.moveTo(v0,y0); h.lineTo(v1,y0); h.lineTo(v1,y1); h.lineTo(v0,y1);
    forma.holes.push(h);
  });
  const half=H.parede/2, s=(fora===undefined?-1:fora);
  const casca=(material, externa)=>{
    const geo=new THREE.ExtrudeGeometry(forma,{depth:half,bevelEnabled:false});
    const m=new THREE.Mesh(geo,material);
    const doLadoDeFora = externa ? s : -s;   // +1 = metade de maior coordenada
    if(eixo==='x'){
      // extruda de position.z para position.z+half
      m.position.set(0,0, doLadoDeFora>0 ? fixo : fixo-half);
    } else {
      // depois de girar, ocupa de position.x-half até position.x
      m.rotation.y=-Math.PI/2;
      m.position.set(doLadoDeFora>0 ? fixo+half : fixo, 0, 0);
    }
    if(dados) Object.assign(m.userData,dados);
    g.add(m); return m;
  };
  casca(matExt||mat(C.interna), true);
  casca(matInt||matExt||mat(C.interna), false);
}

/* vidro e caixilho preto para dentro de um vão */
function esquadria(g, eixo, fixo, a, b, y0, y1, dados){
  const e=0.05, cx=(a+b)/2, cy=(y0+y1)/2;
  const put=(w,h,off,material)=>{
    const geo=new THREE.BoxGeometry(eixo==='x'?w:e, h, eixo==='x'?e:w);
    const m=new THREE.Mesh(geo,material);
    if(eixo==='x') m.position.set(off===null?cx:off, cy, fixo);
    else           m.position.set(fixo, cy, off===null?cx:off);
    if(dados) Object.assign(m.userData,dados);
    g.add(m);
  };
  put(b-a, y1-y0, null, mat(C.vidro,{transparent:true,opacity:0.42}));
  const mp=mat(C.preto);
  // montante central e travessas, que é o desenho da janela de correr do vídeo.
  // TODOS levam a marca de etapa, senão os caixilhos ficam boiando no ar
  // quando se desliga a etapa a que a janela pertence.
  const geoM=new THREE.BoxGeometry(eixo==='x'?0.06:e+0.01, y1-y0, eixo==='x'?e+0.01:0.06);
  const mm=new THREE.Mesh(geoM,mp);
  if(eixo==='x') mm.position.set(cx,cy,fixo); else mm.position.set(fixo,cy,cx);
  if(dados) Object.assign(mm.userData,dados);
  g.add(mm);
  [[y0,0.06],[y1,0.06]].forEach(([yy,t])=>{
    const geoT=new THREE.BoxGeometry(eixo==='x'?b-a:e+0.01, t, eixo==='x'?e+0.01:b-a);
    const t2=new THREE.Mesh(geoT,mp);
    if(eixo==='x') t2.position.set(cx,yy,fixo); else t2.position.set(fixo,yy,cx);
    if(dados) Object.assign(t2.userData,dados);
    g.add(t2);
  });
}

/* ---------------------------------------------------------------- geometria
   Tudo é lido de AMBIENTES / RECUO / CASA_L / CASA_W, então a maquete
   acompanha o que for editado na planta.                                    */

function amb(id){ return AMBIENTES.find(a=>a.id===id); }

/* Em que trecho da casa cada etapa entra. A divisa cega, a laje e a platibanda
   atravessam a casa inteira, mas NÃO são construídas de uma vez — sem fatiar
   por etapa, ligar só a Etapa 1 mostraria um telhado de 15 m que ainda não
   existe, e a maquete mentiria sobre o que o dinheiro de hoje compra. */
function faixas(){
  const m={};
  AMBIENTES.forEach(a=>{
    const e=a.etapa||1;
    if(!m[e]) m[e]={x0:a.x, x1:a.x+a.w};
    else { m[e].x0=Math.min(m[e].x0,a.x); m[e].x1=Math.max(m[e].x1,a.x+a.w); }
  });
  return Object.keys(m).map(k=>({etapa:+k,x0:m[k].x0,x1:m[k].x1}))
                       .sort((a,b)=>a.x0-b.x0);
}
function lim(){
  const x0=RECUO, x1=RECUO+CASA_L, z0=CORR, z1=CORR+CASA_W;
  return {x0,x1,z0,z1};
}

function montaTerreno(){
  const g=new THREE.Group(); grupos.terreno=g; cena.add(g);
  bloco(g, 0,0, LOTE_C,LOTE_L, -0.30,0, mat(C.terreno));

  const L=lim(), N=amb('nicho');
  // corredor lateral: pedrisco escuro com placas de concreto, como no vídeo
  if(L.z0>0.05){
    bloco(g, L.x0,0, L.x1,L.z0, 0,0.06, mat(C.pedrisco));
    for(let x=L.x0+0.35; x<L.x1-0.7; x+=1.45)
      bloco(g, x,L.z0/2-0.42, x+0.85,L.z0/2+0.42, 0.06,0.10, mat(C.placa));
  }
  // piso da garagem e do quintal
  bloco(g, 0,0, L.x0,LOTE_L, 0,0.06, mat(C.placa));
  if(LOTE_C-L.x1>0.4){
    bloco(g, L.x1,0, LOTE_C,LOTE_L, 0,0.05, mat(C.grama));
    bloco(g, L.x1,L.z0, L.x1+1.6,LOTE_L, 0,0.10, mat(C.piso));   // soleira dos fundos
  }
  // contrapiso da casa e do nicho, em porcelanato bege
  bloco(g, L.x0,L.z0, L.x1,L.z1, 0,H.piso, mat(C.piso));
  if(N) bloco(g, N.x,N.y, N.x+N.w,N.y+N.h, 0,H.piso+0.005, mat(C.piso));
  // desenho de junta do porcelanato — formato grande, como no vídeo
  for(let x=L.x0+1.2; x<L.x1; x+=1.2)
    bloco(g, x-0.01,L.z0, x+0.01,L.z1, H.piso,H.piso+0.004, mat(C.pisoJunta));
  for(let z=L.z0+1.2; z<L.z1; z+=1.2)
    bloco(g, L.x0,z-0.01, L.x1,z+0.01, H.piso,H.piso+0.004, mat(C.pisoJunta));
}

function montaMuros(){
  const g=new THREE.Group(); grupos.muro=g; cena.add(g);
  const t=0.15, mMuro=mat(C.muro);
  bloco(g, 0,-t, LOTE_C,0, 0,H.muro, mMuro);            // divisa do corredor
  bloco(g, 0,LOTE_L, LOTE_C,LOTE_L+t, 0,H.muro, mMuro); // divisa cega
  bloco(g, LOTE_C,-t, LOTE_C+t,LOTE_L+t, 0,H.muro, mMuro);
  // portão da garagem: chapa escura ripada na horizontal
  bloco(g, -t,0, 0,LOTE_L, 0,H.muro, mat(C.metal));
  for(let y=0.18; y<H.muro-0.1; y+=0.34)
    bloco(g, -t-0.02,0.06, -t-0.005,LOTE_L-0.06, y,y+0.06, mat(C.preto));
  // concertina: uma sugestão, não é para ficar bonito, é para lembrar que existe
  const mc=mat(0xc8c8c2);
  [[-t/2],[LOTE_L+t/2]].forEach(([z])=>{
    for(let x=0.4; x<LOTE_C; x+=0.55){
      const a=new THREE.Mesh(new THREE.TorusGeometry(0.17,0.012,4,10), mc);
      a.position.set(x,H.muro+0.17,z); a.rotation.y=Math.PI/2; g.add(a);
    }
  });
}

function montaCasa(){
  const g=new THREE.Group(); grupos.casa=g; cena.add(g);
  const L=lim(), N=amb('nicho');
  const base=H.piso, topo=H.piso+H.pd;
  const mExt=mat(C.grafiato), mInt=mat(C.interna);
  const FX=faixas();

  // limite da parte FECHADA: o nicho é aberto, fica fora do fechamento
  const fx0 = N ? N.x+N.w : L.x0;      // onde a fachada do corredor começa
  const nz1 = N ? N.y+N.h : L.z0;      // fundo do nicho

  /* --- fachada frontal do quarto 01, com a janela ------------------------ */
  const q1=amb('q1');
  parede(g,'z',L.x0, N?nz1:L.z0, L.z1, base, topo,
    q1?[[q1.y+0.60, q1.y+2.40, base+H.peitoril, base+H.peitoril+H.janela]]:[],
    mExt, mInt, {etapa:1}, -1);
  if(q1) esquadria(g,'z',L.x0+0.07, q1.y+0.60, q1.y+2.40,
    base+H.peitoril, base+H.peitoril+H.janela, {etapa:1});

  /* --- parede que dá para o nicho -----------------------------------------
     Só existe na frente do quarto 01. Na frente do corredor de acesso ela NÃO
     existe: a boca do corredorzinho é aberta, é por ela que se entra.        */
  const bh=amb('banho'), q1x=q1?q1.x+q1.w:null;
  if(N){
    // NENHUMA porta aqui: não existe acesso ao quarto pelo lado de fora da casa.
    // Só a basculante do banheiro, que é o que ventila.
    const v=[];
    if(bh) v.push([bh.x+0.25, bh.x+0.95, base+H.basc, base+H.basc+H.bascAlt]);
    parede(g,'x',nz1, L.x0, fx0, base, topo, v, mExt, mInt, {etapa:1}, -1);
    if(bh) esquadria(g,'x',nz1-0.07, bh.x+0.25, bh.x+0.95,
      base+H.basc, base+H.basc+H.bascAlt, {etapa:1});
  }

  /* --- fundo do nicho: a porta de entrada -------------------------------- */
  if(N) parede(g,'z',fx0, L.z0, nz1, base, topo,
    [[L.z0+0.15, L.z0+0.95, base, base+H.porta]], mExt, mInt, {etapa:1}, -1);

  /* --- fachada do corredor: sala, quarto 02 e banho da suíte ------------- */
  const sala=amb('sala'), q2=amb('q2'), bs=amb('banhosuite');
  const vaosCorr=[];
  if(sala){
    vaosCorr.push([sala.x+1.60, sala.x+2.90, base+H.peitoril, base+H.peitoril+H.janela]);
    vaosCorr.push([sala.x+3.40, sala.x+4.70, base+H.peitoril, base+H.peitoril+H.janela]);
    vaosCorr.push([sala.x+0.50, sala.x+1.30, base, base+H.porta]);
  }
  if(q2) vaosCorr.push([q2.x+1.00, q2.x+2.80, base+H.peitoril, base+H.peitoril+H.janela]);
  if(bs) vaosCorr.push([bs.x+0.35, bs.x+1.25, base+H.basc, base+H.basc+H.bascAlt]);
  FX.forEach(f=>{
    const a=Math.max(f.x0,fx0), b=f.x1;
    if(b-a<0.02) return;
    const hs=vaosCorr.filter(v=>v[0]>=a-0.001 && v[1]<=b+0.001);
    parede(g,'x',L.z0, a, b, base, topo, hs, mExt, mInt, {etapa:f.etapa}, -1);
  });
  if(sala){
    esquadria(g,'x',L.z0+0.07, sala.x+1.60, sala.x+2.90, base+H.peitoril, base+H.peitoril+H.janela,{etapa:2});
    esquadria(g,'x',L.z0+0.07, sala.x+3.40, sala.x+4.70, base+H.peitoril, base+H.peitoril+H.janela,{etapa:2});
  }
  if(q2) esquadria(g,'x',L.z0+0.07, q2.x+1.00, q2.x+2.80, base+H.peitoril, base+H.peitoril+H.janela,{etapa:3});
  if(bs) esquadria(g,'x',L.z0+0.07, bs.x+0.35, bs.x+1.25, base+H.basc, base+H.basc+H.bascAlt,{etapa:3});

  /* --- fundos, com a porta do quintal ------------------------------------ */
  // JANELA nos fundos, não porta: o quarto do fim não tem saída para o quintal
  parede(g,'z',L.x1, L.z0, L.z1, base, topo,
    [[L.z1-1.80, L.z1-0.40, base+H.peitoril, base+H.peitoril+H.janela]], mExt, mInt, {etapa:3}, +1);
  esquadria(g,'z',L.x1-0.07, L.z1-1.80, L.z1-0.40,
    base+H.peitoril, base+H.peitoril+H.janela, {etapa:3});

  /* --- divisa cega: nenhuma abertura, nunca. Fatiada por etapa. ---------- */
  FX.forEach(f=>parede(g,'x',L.z1, f.x0, f.x1, base, topo, [], mExt, mInt, {etapa:f.etapa}, +1));

  /* --- paredes internas -------------------------------------------------- */
  const mi=mat(C.interna);
  // Divisória entre o quarto 01 e o banheiro. Ela para em y=5,60: dali até a divisa
  // cega fica o VÃO, um recuo aberto no quarto, e é nele que mora a porta do banheiro.
  const vo=amb('vao1');
  // divisória do quarto, inteira, com a PORTA DO QUARTO dentro do vão
  if(q1) parede(g,'z',q1.x+q1.w, q1.y, q1.y+q1.h, base, topo,
    vo?[[vo.y+0.05, vo.y+0.75, base, base+H.porta]]:[], mi, mi, {etapa:1});
  // porta do banheiro, na parede do vão
  if(bh&&vo) parede(g,'x',vo.y, bh.x, bh.x+bh.w, base, topo,
    [[bh.x+0.25, bh.x+0.95, base, base+H.porta]], mi, mi, {etapa:1}, +1);
  // banheiro contra a sala: parede cheia
  if(bh) parede(g,'z',bh.x+bh.w, bh.y, bh.y+bh.h, base, topo, [], mi, mi, {etapa:1});
  // vão contra a sala: é POR AQUI que se chega ao vão, e daí ao quarto
  if(vo) parede(g,'z',vo.x+vo.w, vo.y, vo.y+vo.h, base, topo,
    [[vo.y+0.05, vo.y+0.75, base, base+H.porta]], mi, mi, {etapa:1});
  if(sala) parede(g,'z',sala.x+sala.w, sala.y, sala.y+sala.h, base, topo,
    [[sala.y+0.15, sala.y+0.95, base, base+H.porta]], mi, mi, {etapa:3});
  if(bs){
    parede(g,'z',bs.x, bs.y, bs.y+bs.h, base, topo,
      [[bs.y+1.05, bs.y+1.75, base, base+H.porta]], mi, mi, {etapa:3});
    parede(g,'x',bs.y+bs.h, bs.x, bs.x+bs.w, base, topo, [], mi, mi, {etapa:3});
  }

  /* --- laje, platibanda e o beiral que cobre o nicho --------------------- */
  const gt=new THREE.Group(); grupos.teto=gt; cena.add(gt);
  const yl=topo, yl2=topo+H.laje, p=0.12;
  const prim=FX[0], ult=FX[FX.length-1];
  FX.forEach(f=>{
    // laje, teto branco por baixo e as duas platibandas laterais, tudo no
    // trecho daquela etapa
    bloco(gt, f.x0,L.z0, f.x1,L.z1, yl,yl2, mat(C.grafClaro), {etapa:f.etapa});
    bloco(gt, f.x0,L.z0+0.05, f.x1,L.z1-0.05, yl-0.02,yl, mat(C.teto), {etapa:f.etapa});
    bloco(gt, f.x0,L.z0-p, f.x1,L.z0, yl,yl2+H.platib, mat(C.grafiato), {etapa:f.etapa});
    bloco(gt, f.x0,L.z1, f.x1,L.z1+p, yl,yl2+H.platib, mat(C.grafiato), {etapa:f.etapa});
  });
  // platibanda da frente sai com o primeiro módulo; a dos fundos, com o último
  bloco(gt, L.x0-p,L.z0-p, L.x0,L.z1+p, yl,yl2+H.platib, mat(C.grafiato), {etapa:prim.etapa});
  bloco(gt, L.x1,L.z0-p, L.x1+p,L.z1+p, yl,yl2+H.platib, mat(C.grafiato), {etapa:ult.etapa});
  // cobertura da garagem, que no vídeo é fechada
  bloco(gt, 0,0, L.x0,LOTE_L, H.garagem,H.garagem+H.laje, mat(C.grafClaro), {etapa:4});
  bloco(gt, -p,0-p, 0,LOTE_L+p, H.garagem,H.garagem+H.laje+H.platib, mat(C.grafiato), {etapa:4});
}

function montaMobilia(){
  const g=new THREE.Group(); grupos.mob=g; cena.add(g);
  const base=H.piso, L=lim();
  const sala=amb('sala'), q1=amb('q1'), q2=amb('q2'), bh=amb('banho'), bs=amb('banhosuite');

  if(sala){
    // ripado de madeira do piso ao teto na divisa cega, com a TV
    const rz=sala.y+sala.h-0.06;
    for(let x=sala.x+0.35; x<sala.x+3.35; x+=0.10)
      bloco(g, x,rz-0.05, x+0.06,rz, base,base+H.pd, mat(C.madeira), {etapa:2});
    bloco(g, sala.x+1.15,rz-0.12, sala.x+2.55,rz-0.06, base+1.05,base+1.85, mat(C.preto), {etapa:2});
    // península da cozinha: bancada branca, tampo preto — como no vídeo
    bloco(g, sala.x+4.20,sala.y+0.60, sala.x+4.80,sala.y+3.20, base,base+0.88, mat(C.bancada), {etapa:2});
    bloco(g, sala.x+4.15,sala.y+0.55, sala.x+4.85,sala.y+3.25, base+0.88,base+0.92, mat(C.granito), {etapa:2});
    // bancada em L encostada na divisa
    bloco(g, sala.x+4.20,rz-0.60, sala.x+5.80,rz, base,base+0.88, mat(C.bancada), {etapa:2});
    bloco(g, sala.x+4.15,rz-0.65, sala.x+5.85,rz, base+0.88,base+0.92, mat(C.granito), {etapa:2});
    // sofá
    bloco(g, sala.x+0.90,sala.y+0.50, sala.x+2.90,sala.y+1.35, base,base+0.75, mat(C.sofa), {etapa:2});
  }
  if(q1){ // cama de casal com cabeceira na fachada frontal
    bloco(g, q1.x+0.20,q1.y+0.60, q1.x+2.20,q1.y+2.20, base,base+0.55, mat(0xe6e2dc), {etapa:1});
    bloco(g, q1.x+0.20,q1.y+0.60, q1.x+0.32,q1.y+2.20, base,base+1.00, mat(C.madeira), {etapa:1});
    // guarda-roupa na divisa cega: a parede do nicho agora tem a porta na ponta
    bloco(g, q1.x+0.20,q1.y+2.55, q1.x+2.00,q1.y+2.95, base,base+2.30, mat(0xe9e5df), {etapa:1});
  }
  if(q2){
    bloco(g, q2.x+0.60,q2.y+2.20, q2.x+2.60,q2.y+3.80, base,base+0.55, mat(0xe6e2dc), {etapa:3});
    bloco(g, q2.x+0.60,q2.y+3.68, q2.x+2.60,q2.y+3.80, base,base+1.00, mat(C.madeira), {etapa:3});
  }
  // banheiros: box de vidro com perfil preto, cuba e vaso
  [[bh,1],[bs,3]].forEach(([b,et])=>{
    if(!b) return;
    const bx=b.x+b.w-1.05, bz=b.y+b.h-1.05;
    bloco(g, bx,bz, bx+0.95,bz+0.95, base,base+0.03, mat(C.pisoJunta), {etapa:et});
    bloco(g, bx,bz, bx+0.04,bz+0.95, base,base+1.90, mat(C.preto,{transparent:true,opacity:0.75}), {etapa:et});
    bloco(g, bx,bz, bx+0.95,bz+0.04, base,base+1.90, mat(C.preto,{transparent:true,opacity:0.75}), {etapa:et});
    // pia recuada, para não ficar atrás do giro da porta
    bloco(g, b.x+0.15,b.y+0.30, b.x+0.65,b.y+0.75, base+0.80,base+0.92, mat(C.bancada), {etapa:et});
  });
}

/* Área gourmet dos fundos — não está orçada, entra como projeção do que o
   vídeo mostra. Fica desligada por padrão para não se confundir com o que já
   tem preço. */
function montaFuturo(){
  const g=new THREE.Group(); grupos.futuro=g; cena.add(g);
  const L=lim(), x0=L.x1+0.6, x1=Math.min(x0+3.4, LOTE_C-1.2);
  if(x1-x0<1.0) return;
  bloco(g, x0,L.z0, x1,LOTE_L, 0.05,0.16, mat(C.piso));
  bloco(g, x0,LOTE_L-0.75, x1,LOTE_L-0.10, 0.16,0.98, mat(C.bancada));
  bloco(g, x0-0.05,LOTE_L-0.80, x1+0.05,LOTE_L-0.05, 0.98,1.04, mat(C.granito));
  [[x0,L.z0],[x1,L.z0]].forEach(([x,z])=>bloco(g, x-0.09,z, x+0.09,z+0.18, 0.16,2.70, mat(C.grafClaro)));
  bloco(g, x0-0.15,L.z0-0.15, x1+0.15,LOTE_L, 2.70,2.85, mat(C.grafClaro));
}

/* ------------------------------------------------------------------ visibilidade */
function aplicaFiltros(){
  if(grupos.teto)   grupos.teto.visible   = togOn.teto;
  if(grupos.mob)    grupos.mob.visible    = togOn.mob;
  if(grupos.muro)   grupos.muro.visible   = togOn.muro;
  if(grupos.futuro) grupos.futuro.visible = togOn.futuro;
  ['casa','teto','mob'].forEach(k=>{
    if(!grupos[k]) return;
    grupos[k].traverse(o=>{
      if(o.isMesh && o.userData.etapa!=null) o.visible = !!etapaOn[o.userData.etapa];
    });
  });
  render();
}

function render(){ if(pronto) ren.render(cena,cam); }

/* --------------------------------------------------------------- construção */
function constroi(){
  Object.values(grupos).forEach(g=>{
    g.traverse(o=>{ if(o.isMesh){ o.geometry.dispose(); } });
    cena.remove(g);
  });
  grupos={};
  montaTerreno(); montaMuros(); montaCasa(); montaMobilia(); montaFuturo();
  aplicaFiltros();
}
V3.reconstruir = function(){ if(pronto) constroi(); };

/* ------------------------------------------------------------------ câmeras */
/* As vistas são dadas em fração do lote, não em metros fixos, para continuarem
   certas se o Renan mudar o recuo ou o comprimento da casa. */
function VISTAS(){
  const L=lim(), meio=(L.x0+L.x1)/2, cz=LOTE_L/2;
  return {
    // três quartos alto pela frente: pega o portão, a fachada e o corredor de
    // uma vez, e continua legível com a cobertura ligada
    frente:   {theta:-2.50, phi:1.05, dist:20, alvo:[L.x0+3.0,1.2,cz]},
    // da calçada mesmo, no nível de quem passa na rua
    rua:      {theta:-3.05, phi:1.34, dist:Math.max(12,L.x0*2.4), alvo:[L.x0+1.0,1.6,cz]},
    // dentro do corredor, na altura dos olhos, olhando para o fundo
    corredor: {theta:-3.06, phi:1.50, dist:10, alvo:[meio+1.5,1.6,L.z0*0.6]},
    // do quintal, olhando a casa por trás
    fundos:   {theta: 0.06, phi:1.22, dist:11, alvo:[L.x1-1.8,1.4,cz]},
    // planta em perspectiva de cima
    topo:     {theta:-1.57, phi:0.11, dist:LOTE_C*0.95, alvo:[meio,0.3,cz]},
    // encostado na casa, para sentir a largura real do corredor
    olho:     {theta:-1.75, phi:1.52, dist:2.6, alvo:[meio,1.5,L.z0+0.6]}
  };
}
function vista(nome){
  const v=VISTAS()[nome]; if(!v) return;
  orb.theta=v.theta; orb.phi=v.phi; orb.dist=v.dist;
  orb.alvo.set(v.alvo[0],v.alvo[1],v.alvo[2]);
  aplicaCamera(); render();
}

/* --------------------------------------------------------------------- init */
V3.iniciar = function(){
  if(pronto) { redimensiona(); return; }
  caixa=document.getElementById('viewbox');
  const aviso=document.getElementById('v3load');
  if(typeof THREE==='undefined'){
    aviso.innerHTML='Não achei o <b>three.min.js</b> nesta pasta.<br>'+
      'Ele tem que ficar ao lado do app-obra.html para a maquete abrir sem internet.';
    return;
  }
  ren=new THREE.WebGLRenderer({antialias:true});
  ren.setPixelRatio(Math.min(devicePixelRatio,2));
  cena=new THREE.Scene();
  cena.background=new THREE.Color(0xc9d3da);
  cena.fog=new THREE.Fog(0xc9d3da, 55, 110);
  cam=new THREE.PerspectiveCamera(46,1,0.1,300);

  // sol alto de Goiás mais um preenchimento, para as faces não ficarem chapadas
  cena.add(new THREE.HemisphereLight(0xdfe9f0, 0x8a8578, 0.85));
  const sol=new THREE.DirectionalLight(0xfff3e0, 0.75);
  sol.position.set(-14,22,10); cena.add(sol);
  const sec=new THREE.DirectionalLight(0xd8e4ee, 0.30);
  sec.position.set(18,12,-8); cena.add(sec);

  caixa.appendChild(ren.domElement);
  aviso.remove();
  pronto=true;
  constroi();
  vista('frente');
  redimensiona();
  ligaMouse();
};

function redimensiona(){
  if(!pronto||!caixa) return;
  const w=caixa.clientWidth, h=caixa.clientHeight;
  if(!w||!h) return;
  ren.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); render();
}
V3.redimensionar = redimensiona;

/* ------------------------------------------------------------------- mouse */
function ligaMouse(){
  let arrastando=false, desloc=false, px=0, py=0;
  const dn=e=>{
    arrastando=true; desloc=(e.button===2||e.shiftKey);
    px=e.clientX; py=e.clientY; caixa.classList.add('dragging');
    caixa.setPointerCapture(e.pointerId);
  };
  const mv=e=>{
    if(!arrastando) return;
    const dx=e.clientX-px, dy=e.clientY-py; px=e.clientX; py=e.clientY;
    if(desloc){
      // desloca no plano do chão, na direção para onde a câmera olha
      const k=orb.dist*0.0016;
      const s=Math.sin(orb.theta), c=Math.cos(orb.theta);
      orb.alvo.x += (-dx*s - dy*c)*k;
      orb.alvo.z += ( dx*c - dy*s)*k;
    } else {
      orb.theta -= dx*0.006;
      orb.phi = Math.max(0.08, Math.min(1.56, orb.phi - dy*0.006));
    }
    aplicaCamera(); render();
  };
  const up=e=>{ arrastando=false; caixa.classList.remove('dragging');
    try{caixa.releasePointerCapture(e.pointerId);}catch(_){} };
  caixa.addEventListener('pointerdown',dn);
  caixa.addEventListener('pointermove',mv);
  caixa.addEventListener('pointerup',up);
  caixa.addEventListener('pointercancel',up);
  caixa.addEventListener('contextmenu',e=>e.preventDefault());
  caixa.addEventListener('wheel',e=>{
    e.preventDefault();
    orb.dist=Math.max(3.5, Math.min(70, orb.dist*(1+Math.sign(e.deltaY)*0.12)));
    aplicaCamera(); render();
  },{passive:false});

  // dois dedos: aproximar
  let d0=null;
  caixa.addEventListener('touchmove',e=>{
    if(e.touches.length!==2) return;
    const dx=e.touches[0].clientX-e.touches[1].clientX,
          dy=e.touches[0].clientY-e.touches[1].clientY;
    const d=Math.hypot(dx,dy);
    if(d0) { orb.dist=Math.max(3.5,Math.min(70, orb.dist*d0/d)); aplicaCamera(); render(); }
    d0=d;
  },{passive:true});
  caixa.addEventListener('touchend',()=>{d0=null;});

  addEventListener('resize',redimensiona);
}

/* ------------------------------------------------------------------ botões */
V3.ligarBotoes = function(){
  document.querySelectorAll('[data-cam]').forEach(b=>
    b.addEventListener('click',()=>vista(b.dataset.cam)));
  document.querySelectorAll('[data-tog]').forEach(b=>
    b.addEventListener('click',()=>{
      const k=b.dataset.tog; togOn[k]=!togOn[k];
      b.setAttribute('aria-pressed',String(togOn[k])); aplicaFiltros();
    }));
  document.querySelectorAll('[data-et]').forEach(b=>
    b.addEventListener('click',()=>{
      const n=+b.dataset.et; etapaOn[n]=!etapaOn[n];
      b.setAttribute('aria-pressed',String(etapaOn[n])); aplicaFiltros();
    }));
};

})();
