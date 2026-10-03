// Modelo fisiológico simplificado (compartimentos) — paso dt
const PROFILES = {
  velocista: { name:'Velocista', pcrTauMul:1.0, glyMul:1.15, clrMul:0.9, pcrShare:1.1 },
  mixto:     { name:'Mixto',     pcrTauMul:0.9, glyMul:1.0,  clrMul:1.0, pcrShare:1.0 },
  fondista:  { name:'Fondista',  pcrTauMul:0.8, glyMul:0.8,  clrMul:1.2, pcrShare:0.9 },
};
// Ajustes por edad: niños resintetizan PCr más rápido y producen menos lactato; másters recuperan más lento
function ageFactors(age){
  if(age==null||isNaN(age)) return {pcr:1,gly:1,clr:1,label:'Adulto'};
  if(age<12) return {pcr:0.75,gly:0.6,clr:1.2,label:'Infantil (< 12)'};
  if(age<15) return {pcr:0.85,gly:0.75,clr:1.1,label:'Púber (12–14)'};
  if(age<18) return {pcr:0.95,gly:0.9,clr:1.05,label:'Juvenil (15–17)'};
  if(age<35) return {pcr:1,gly:1,clr:1,label:'Adulto (18–34)'};
  if(age<50) return {pcr:1.1,gly:0.95,clr:0.95,label:'Máster (35–49)'};
  return {pcr:1.2,gly:0.85,clr:0.9,label:'Máster (50 +)'};
}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function intensityFactor(I){ return Math.pow(clamp((I-55)/45,0,1),1.6); } // 0..1
function simulate(p){
  const {work, intensity:I, rest, reps, mode, activeInt=35, profile='mixto', dt=0.5, lite=false, post=null, age=null} = p;
  const ag = ageFactors(age);
  const pr = PROFILES[profile];
  const k = intensityFactor(I);
  const dmax = 0.88*k;                     // depleción máxima de PCr
  const tauDep = 7 + 20*(1-k);             // s
  const a = 0.7, tau1 = 30*pr.pcrTauMul*ag.pcr, tau2 = 170*pr.pcrTauMul*ag.pcr;
  // lactato: M = músculo (mmol/L equiv), B = sangre
  const base = (p.laBase>0 ? p.laBase : 1.2);
  const laScale = (p.laScale>0 ? p.laScale : 1);
  let pcr=1, Df=0, Ds=0, M=base, B=base;
  const exch = 1/160;               // intercambio músculo→sangre (s^-1)
  const act = mode==='activo';
  const actK = act ? clamp(activeInt,15,70) : 0;
  // aclaramiento: pasivo t1/2 ~ 18 min; activo óptimo ~ 35-45% → t1/2 ~ 7 min
  const clrActive = act ? (1 - Math.pow((actK-40)/40,2)*0.8) : 0;  // 0..1 máx en 40%
  const halfClr = act ? (18*60)/(1+1.6*clamp(clrActive,0,1)) : 18*60;
  const kclr = Math.LN2/halfClr*pr.clrMul*ag.clr;
  const series=[]; const repsOut=[];
  let t=0, tEffort=0, peakB=base;
  const total = reps*work + (reps-1)*rest + (post!==null?post:Math.max(rest, 300));
  let rep=0, phase='work', phaseT=0;
  let capStart=null, pcrStart=null, fresh=null;
  const capacity = ()=>{
    // capacidad disponible (% del máximo fresco) al inicio de un esfuerzo
    const wP = clamp((0.32*Math.exp(-work/25)+0.08)*pr.pcrShare,0.05,0.5);
    const pcrTerm = 1 - wP*(1-pcr);
    const ac = 0.005 + 0.02*(1-Math.exp(-work/35));
    const acid = 1 - clamp(ac*Math.max(0,M-5),0,0.4);
    return 100*pcrTerm*acid;
  };
  for(; t<=total+1e-9; t+=dt){
    if(phase==='work' && phaseT===0){
      const c = capacity(); if(fresh===null) fresh=c;
      const capP = c/fresh*100; capStart = 100*Math.cbrt(capP/100); pcrStart=pcr; repsOut.push({rep:rep+1, cap:capStart, capP, pcr:pcrStart*100, laStart:B});
    }
    const working = phase==='work';
    if(working){
      // uso de PCr
      const target = 1-dmax;
      if(pcr>target){ const d=(pcr-target)/tauDep*dt; pcr-=d; Df+=a*d; Ds+=(1-a)*d; }
      tEffort+=dt;
      // producción glucolítica (mmol/L/s) — activación rápida, caída con duración y con acidosis
      const act0 = 1-Math.exp(-phaseT/6);
      const decay = 0.55+0.45*Math.exp(-phaseT/60);
      const inhib = 1 - clamp((M-6)/16,0,0.85);
      const P = 2.1*laScale*pr.glyMul*ag.gly*Math.pow(k,2)*act0*decay*inhib*(0.4+0.6*(1-pcr));
      M += P*dt;
    } else {
      const acidMul = 1 + 0.08*Math.max(0,M-4);            // acidosis ralentiza resíntesis
      const actMul = act ? (1 + 0.012*actK) : 1;           // activo compite por O2
      Df -= Df/(tau1*acidMul*actMul)*dt; Ds -= Ds/(tau2*acidMul*actMul)*dt;
      pcr = 1-Df-Ds;
      if(act){ // pequeño consumo aeróbico sostenido: sin depleción adicional
      }
    }
    // intercambio y aclaramiento
    const flux = exch*(M-B)*dt;
    M -= flux*0.6; B += flux*0.95*(1-clamp((B-14)/14,0,0.7));
    const oxM = (working?0.006:0.002)*(M-base)*dt*(act&&!working?2.2:1);
    M -= oxM;
    B -= kclr*(B-base)*dt*(working?0.6:1);
    if(!lite) series.push({t, pcr:pcr*100, la:B, lam:M, working}); if(B>peakB) peakB=B;
    if(repsOut.length) repsOut[repsOut.length-1].laEnd=B;
    phaseT+=dt;
    if(working && phaseT>=work-1e-9){ rep++; phase = rep>=reps?'post':'rest'; phaseT=0; repsOut[repsOut.length-1].pcrEnd=pcr*100; }
    else if(phase==='rest' && phaseT>=rest-1e-9){ phase='work'; phaseT=0; }
  }
  const caps = repsOut.map(r=>r.cap);
  const best=Math.max(...caps), last=caps[caps.length-1];
  const sds = (1 - caps.reduce((s,x)=>s+x,0)/(best*caps.length))*100;
  const peakLa = peakB;
  return {series, reps:repsOut, sds, fi:(1-last/best)*100, peakLa};
}

// ---------- Sesión completa: bloques encadenados con estado fisiológico continuo ----------
// blocks: [{name, reps, work, intensity, rests:[...]|rest, mode, activeInt, trans, transMode, transAct}]
function simulateSession(blocks, o={}){
  const {profile='mixto', age=null, dt=1, post=600} = o;
  const ag = ageFactors(age), pr = PROFILES[profile];
  const base = (o.laBase>0 ? o.laBase : 1.2), laScale = (o.laScale>0 ? o.laScale : 1);
  const a = 0.7, tau1 = 30*pr.pcrTauMul*ag.pcr, tau2 = 170*pr.pcrTauMul*ag.pcr, exch = 1/160;
  // construir segmentos
  const segs=[];
  blocks.forEach((b,bi)=>{
    for(let r=0;r<b.reps;r++){
      segs.push({kind:'work', dur:b.work, bi, rep:r, I:b.intensity, work:b.work});
      if(r<b.reps-1){ const rr = Array.isArray(b.rests) ? (b.rests[r] ?? b.rests[b.rests.length-1]) : b.rest; segs.push({kind:'rest', dur:rr, bi, mode:b.mode, actK:b.activeInt}); }
    }
    if(bi<blocks.length-1) segs.push({kind:'rest', dur:b.trans, bi, trans:true, mode:b.transMode, actK:b.transAct});
    else segs.push({kind:'rest', dur:post, bi, post:true, mode:b.transMode, actK:b.transAct});
  });
  let pcr=1, Df=0, Ds=0, M=base, B=base, t=0;
  const series=[], reps=[], bStats=blocks.map(()=>({peakLa:base, tStart:null, tEnd:null, pcrStart:null, laStart:null}));
  for(const s of segs){
    const working = s.kind==='work';
    let k=0,dmax=0,tauDep=1,act=false,actK=0,kclr=0;
    if(working){ k=intensityFactor(s.I); dmax=0.88*k; tauDep=7+20*(1-k);
      const wP = clamp((0.32*Math.exp(-s.work/25)+0.08)*pr.pcrShare,0.05,0.5);
      const ac = 0.005 + 0.02*(1-Math.exp(-s.work/35));
      const capP = 100*(1-wP*(1-pcr))*(1-clamp(ac*Math.max(0,M-5),0,0.4));
      const bs = bStats[s.bi]; if(s.rep===0){ bs.tStart=t; bs.pcrStart=pcr*100; bs.laStart=B; }
      reps.push({bi:s.bi, rep:s.rep+1, cap:100*Math.cbrt(capP/100), capP, pcr:pcr*100, laStart:B, t0:t});
    } else { act = s.mode==='activo'; actK = act ? clamp(s.actK||35,15,70) : 0;
      const clrA = act ? (1 - Math.pow((actK-40)/40,2)*0.8) : 0;
      const half = act ? (18*60)/(1+1.6*clamp(clrA,0,1)) : 18*60;
      kclr = Math.LN2/half*pr.clrMul*ag.clr; }
    const kclrW = Math.LN2/(18*60)*pr.clrMul*ag.clr;
    const n = Math.max(1, Math.round(s.dur/dt));
    for(let i=0;i<n;i++){
      const ph = i*dt;
      if(working){
        const target=1-dmax; if(pcr>target){ const d=(pcr-target)/tauDep*dt; pcr-=d; Df+=a*d; Ds+=(1-a)*d; }
        const act0 = 1-Math.exp(-ph/6), decay = 0.55+0.45*Math.exp(-ph/60), inhib = 1 - clamp((M-6)/16,0,0.85);
        M += 2.1*laScale*pr.glyMul*ag.gly*Math.pow(k,2)*act0*decay*inhib*(0.4+0.6*(1-pcr))*dt;
      } else {
        const acidMul = 1 + 0.08*Math.max(0,M-4), actMul = act ? (1+0.012*actK) : 1;
        Df -= Df/(tau1*acidMul*actMul)*dt; Ds -= Ds/(tau2*acidMul*actMul)*dt; pcr = 1-Df-Ds;
      }
      const flux = exch*(M-B)*dt;
      M -= flux*0.6; B += flux*0.95*(1-clamp((B-14)/14,0,0.7));
      M -= (working?0.006:0.002)*(M-base)*dt*(act&&!working?2.2:1);
      B -= (working?kclrW:kclr)*(B-base)*dt*(working?0.6:1);
      t += dt;
      series.push({t, pcr:pcr*100, la:B, working, bi:s.bi});
      const bs=bStats[s.bi]; if(B>bs.peakLa) bs.peakLa=B;
    }
    if(working){ const r=reps[reps.length-1]; r.pcrEnd=pcr*100; r.laEnd=B; }
    if(s.kind==='rest' && (s.trans||s.post)) bStats[s.bi].tEnd = t - s.dur;
  }
  bStats.forEach((bs,bi)=>{
    const rr = reps.filter(r=>r.bi===bi), caps = rr.map(r=>r.cap);
    const best=Math.max(...caps);
    bs.sds = (1 - caps.reduce((x,y)=>x+y,0)/(best*caps.length))*100;
    bs.fi = (1 - caps[caps.length-1]/caps[0])*100;
  });
  return {series, reps, blocks:bStats, total:t};
}
if(typeof window!=='undefined'){window.PhysioModel={simulate,simulateSession,PROFILES,intensityFactor,ageFactors};}
if(typeof module!=='undefined') module.exports={simulate,simulateSession,PROFILES,intensityFactor};
