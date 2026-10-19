const SHEET_ID = "1V4wHyGdhULg2g4vWgg0HlspuscWNcq-lHuJIrdTF5_g";
const COLORS = {
  "Design":"#111820",
  "Stage 0 - As Cast":"#4f6f91",
  "Stage 1 - After Stitching":"#ec8b22",
  "Stage 2 - After Stressing":"#34955b",
  "Final Alignment - Before Joint Check":"#78a9dc",
  "Final Alignment - After Joint Check":"#1f5da8",
  "Upon Completion - Before Joint Check":"#efaa55",
  "Upon Completion - After Joint Check":"#9a4c9c"
};
const state = { point:"BC", span:"", spans:[], data:null, loadedAt:null, view:"final", revision:"after" };
const $ = (s) => document.querySelector(s);
const tables = $("#tables"), statusBox = $("#status"), errorPanel = $("#errorPanel");
let jsonpSequence = 0;

function gviz(sheet, query){
  return new Promise((resolve,reject)=>{
    const cb = "__gviz_cb_" + (++jsonpSequence);
    const timer = setTimeout(()=>finish(new Error("Google Sheet response timed out.")),25000);
    const script = document.createElement("script");
    const finish = (err,data)=>{
      clearTimeout(timer); delete window[cb]; script.remove();
      err ? reject(err) : resolve(data);
    };
    window[cb] = (payload)=>{
      if(!payload || payload.status === "error") return finish(new Error(payload?.errors?.[0]?.detailed_message || "Google Sheet query failed."));
      finish(null,payload.table);
    };
    const tqx = `out:json;responseHandler:${cb}`;
    script.onerror = ()=>finish(new Error("Unable to connect to Google Sheet."));
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheet)}&headers=1&tqx=${encodeURIComponent(tqx)}&tq=${encodeURIComponent(query)}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}
function rows(table){ return (table?.rows || []).map(r=>(r.c||[]).map(c=>c ? (c.v ?? null) : null)); }
function normalizeSpan(v){
  const m = String(v||"").toUpperCase().match(/P-?(\d+[A-Z]?)\D+P?-?(\d+[A-Z]?)/);
  return m ? `P${m[1]}-${m[2]}` : "";
}
function q(v){ return String(v).replace(/'/g,"\\'"); }
function num(v){
  if(v === null || v === undefined || String(v).trim() === "") return null;
  const n=Number(v); return Number.isFinite(n) ? n : null;
}
function jointNo(v){ const m=String(v||"").match(/(\d+)/); return m ? Number(m[1]) : null; }
function pointParts(v){
  const m=String(v||"").toUpperCase().match(/(\d+)\s*(BW|BC|BE)P?-?(\d+)/);
  return m ? {joint:+m[1],point:m[2],pier:+m[3]} : null;
}
function cell(v,d=3){ return v==null || !Number.isFinite(Number(v)) ? "–" : Number(v).toFixed(d); }
function mm(v){ return v==null || !Number.isFinite(Number(v)) ? "–" : Number(v).toFixed(1); }
function valClass(v){
  if(v==null || !Number.isFinite(Number(v))) return "missing";
  if(v > 38) return "over";
  if(v < -10) return "bad";
  return "good";
}
function remark(v){ return v==null ? "–" : v>38 ? "Over Camber" : v<-10 ? "Below -10 mm" : "Okay"; }

async function loadSpans(){
  const set = new Set();
  const sources=[
    ["Span Layout Design","F"],["As-Cast","F"],["Before Stressing","A"],
    ["After Stressing","A"],["Final Alignment","A"],["Upon Completion of Parapet Works","F"]
  ];
  const pages=await Promise.all(sources.map(([sheet,col])=>
    gviz(sheet,`select ${col},count(${col}) where ${col} is not null group by ${col}`)
  ));
  pages.flatMap(rows).forEach(r=>{const span=normalizeSpan(r[0]);if(span)set.add(span);});
  state.spans = [...set].sort((a,b)=>{
    const pa=parseInt(a.match(/\d+/)?.[0]||0), pb=parseInt(b.match(/\d+/)?.[0]||0);
    return pa-pb || a.localeCompare(b);
  });
  const select=$("#spanSelect"); select.innerHTML=state.spans.map(s=>`<option value="${s}">${s}</option>`).join("");
  state.span = state.spans.includes("P905-906") ? "P905-906" : state.spans[0];
  select.value=state.span;
}
async function loadSpanData(span){
  const display = `SPAN ${span}`, s = q(span), ds = q(display);
  const tasks = [
    ["design","Span Layout Design",`select A,B,C,D,E,F where F='${ds}'`],
    ["ascast","As-Cast",`select A,B,C,D,E,F where F='${ds}'`],
    ["before","Before Stressing",`select A,B,C,D,E where A='${s}'`],
    ["after","After Stressing",`select A,B,C,D,E where A='${s}'`],
    ["final","Final Alignment",`select A,B,C,D,E where A='${s}'`],
    ["upon","Upon Completion of Parapet Works",`select A,B,C,D,E,F,G where F='${ds}'`],
    ["uponDesign","UPON DESIGN",`select A,B,C,D,E,F where F='${ds}'`],
    ["jointCheckArchive","Joint Check Revision Archive",`select A,B,C,D,E,F,G,H,I,J,K where C='${s}'`],
    ["wir","WIR",`select A,B,C,D,E,F,G,H,I where A='${s}'`]
  ];
  const result={};
  for(const [key,sheet,query] of tasks){
    try{ result[key]=rows(await gviz(sheet,query)); }
    catch(err){ result[key]=[]; result[key+"Error"]=err.message; }
  }
  return result;
}
function elevationMap(list){
  const m=new Map();
  list.forEach(r=>{ const p=pointParts(r[1]); if(p) m.set(`${p.point}${p.joint}`,{joint:p.joint,n:num(r[2]),e:num(r[3]),z:num(r[4])}); });
  return m;
}
function readingMap(list){
  const m=new Map();
  list.forEach(r=>{ const j=jointNo(r[1]), p=String(r[2]||"").toUpperCase(); if(j&&/^(BW|BC|BE)$/.test(p)) m.set(`${p}${j}`,num(r[3])); });
  return m;
}
function alignmentMap(list){
  const m=new Map();
  list.forEach(r=>{const j=jointNo(r[1]),p=String(r[2]||"").toUpperCase();if(j&&/^(BW|BC|BE)$/.test(p))m.set(`${p}${j}`,{joint:j,n:null,e:null,z:num(r[3])});});
  return m;
}
function archiveMap(list,stage,status){
  const m=new Map();
  list.filter(r=>String(r[0]||"").trim()===stage&&String(r[1]||"").trim()===status).forEach(r=>{
    const raw=String(r[3]||"").toUpperCase();
    const p=pointParts(raw), short=raw.match(/(\d+)\s*(BW|BC|BE)/);
    const joint=p?.joint || (short?+short[1]:null), point=p?.point || short?.[2];
    if(joint&&point)m.set(`${point}${joint}`,{joint,n:num(r[4]),e:num(r[5]),z:num(r[6]),date:r[7]||"",wir:r[8]||"",source:r[9]||""});
  });
  return m;
}
function mergedMap(base,override){const m=new Map(base);override.forEach((v,k)=>m.set(k,v));return m;}
function arrayFor(map,joints,point,field=null){
  return joints.map(j=>{const v=map.get(`${point}${j}`);return field ? v?.[field]??null : v??null;});
}
function chainage(design,joints,point){
  const coords=arrayFor(design,joints,point,null);
  let total=0, last=null;
  return coords.map((r,i)=>{
    if(!r || r.n==null || r.e==null || (r.n===0&&r.e===0)) return i===0 ? 0 : null;
    if(last) total+=Math.hypot(r.n-last.n,r.e-last.e);
    last=r; return total;
  });
}
function normalized(values,xs,invert=false){
  const out=Array(values.length).fill(null);
  const valid=values.map((v,i)=>({v:num(v),x:num(xs[i]),i})).filter(o=>o.v!=null&&o.x!=null);
  if(valid.length<2) return out;
  const a=valid[0],b=valid[valid.length-1],dx=b.x-a.x || (b.i-a.i || 1);
  valid.forEach(o=>{
    const t=(o.x-a.x)/dx, chord=a.v+(b.v-a.v)*t;
    out[o.i]=(invert ? -(o.v-chord) : (o.v-chord))*1000;
  });
  return out;
}
function diff(a,b){ return a.map((v,i)=>v==null||b[i]==null?null:v-b[i]); }
function buildModel(data){
  const design=elevationMap(data.design), ascast=elevationMap(data.ascast), uponDesign=elevationMap(data.uponDesign);
  const stitching=readingMap(data.before), stressing=readingMap(data.after);
  const finalCurrent=alignmentMap(data.final), uponCurrent=elevationMap(data.upon);
  const finalBefore=archiveMap(data.jointCheckArchive,"Final Alignment","Before Joint Check");
  const finalAfter=mergedMap(finalCurrent,archiveMap(data.jointCheckArchive,"Final Alignment","After Joint Check"));
  const uponBefore=archiveMap(data.jointCheckArchive,"Upon Completion of Parapet Works","Before Joint Check");
  const uponAfter=mergedMap(uponCurrent,archiveMap(data.jointCheckArchive,"Upon Completion of Parapet Works","After Joint Check"));
  const all=[...design.values(),...ascast.values(),...uponDesign.values(),...finalBefore.values(),...finalAfter.values(),...uponBefore.values(),...uponAfter.values()];
  [...stitching.keys(),...stressing.keys()].forEach(k=>all.push({joint:+k.match(/\d+/)[0]}));
  const designMax=Math.max(0,...[...design.values()].map(x=>x.joint||0));
  const max=designMax || Math.max(0,...all.map(x=>x.joint||0)), joints=Array.from({length:max},(_,i)=>i+1);
  const xs=chainage(design,joints,state.point);
  const zDesign=arrayFor(design,joints,state.point,"z");
  const zAs=arrayFor(ascast,joints,state.point,"z"), zStitching=arrayFor(stitching,joints,state.point), zStressing=arrayFor(stressing,joints,state.point);
  const zFinalBefore=arrayFor(finalBefore,joints,state.point,"z"), zFinalAfter=arrayFor(finalAfter,joints,state.point,"z");
  const special=data.uponDesign.length>0, stage4Design=arrayFor(special?uponDesign:design,joints,state.point,"z");
  const zUponBefore=arrayFor(uponBefore,joints,state.point,"z"), zUponAfter=arrayFor(uponAfter,joints,state.point,"z");
  const n0=normalized(zAs,xs), n1=normalized(zStitching,xs,true), n2=normalized(zStressing,xs,true);
  const nDesign=normalized(zDesign,xs), nFinalBefore=normalized(zFinalBefore,xs), nFinalAfter=normalized(zFinalAfter,xs);
  const nUponBefore=normalized(zUponBefore,xs), nUponAfter=normalized(zUponAfter,xs);
  return {joints,xs,zDesign,zAs,zStitching,zStressing,stage4Design,zFinalBefore,zFinalAfter,zUponBefore,zUponAfter,
    n0,n1,n2,nDesign,nFinalBefore,nFinalAfter,nUponBefore,nUponAfter,d01:diff(n1,n0),d12:diff(n2,n1),
    finalBeforeAvailable:zFinalBefore.some(v=>v!=null),uponBeforeAvailable:zUponBefore.some(v=>v!=null),
    finalAfterAvailable:zFinalAfter.some(v=>v!=null),uponAfterAvailable:zUponAfter.some(v=>v!=null),
    finalBeforeVsDesign:diff(zFinalBefore,zDesign).map(v=>v==null?null:v*1000),
    finalAfterVsDesign:diff(zFinalAfter,zDesign).map(v=>v==null?null:v*1000),
    uponBeforeVsDesign:diff(zUponBefore,stage4Design).map(v=>v==null?null:v*1000),
    uponAfterVsDesign:diff(zUponAfter,stage4Design).map(v=>v==null?null:v*1000),
    finalCorrection:diff(zFinalAfter,zFinalBefore).map(v=>v==null?null:v*1000),
    uponCorrection:diff(zUponAfter,zUponBefore).map(v=>v==null?null:v*1000)};
}
function rowHtml(label,values,formatter=mm,kind="data",remarks=false){
  return `<tr class="${kind}"><th>${label}</th>${values.map(v=>{
    const cls=remarks?valClass(v):(v==null?"missing":"");
    return `<td class="${cls}">${remarks?remark(v):formatter(v)}</td>`;
  }).join("")}</tr>`;
}
function tableSection(title,model,rowsDef,{wir="",unit="mm"}={}){
  const h=rowHtml("Joint No.",model.joints,v=>String(v),"meta");
  const ch=rowHtml("Chainage (m)",model.xs,v=>v==null?"–":Number(v).toFixed(3),"meta");
  return `<section class="stage"><div class="stage-title"><span>${title}</span>${wir?`<span class="wir"><b>WIR No.</b>${wir}</span>`:""}<span class="unit">unit : ${unit}</span></div><div class="grid-wrap"><table class="data-grid"><tbody>${h}${ch}${rowsDef.map(r=>rowHtml(r[0],r[1],r[2]||mm,r[3]||"data",r[4]||false)).join("")}</tbody></table></div></section>`;
}
function wirText(rows,stage){
  const matches=(rows||[]).filter(r=>String(r[1]||"").trim()===stage&&String(r[3]||"").trim());
  const items=[];
  matches.forEach(r=>{
    const line=String(r[2]||"ML").trim(), number=String(r[3]||"").trim();
    const label=line && line!=="ML" ? `${line}: ${number}` : number;
    if(!items.includes(label))items.push(label);
  });
  return items.length ? items.join(" / ") : "Not available";
}
function renderTables(m){
  const both=state.revision==="both", before=state.revision==="before";
  if(state.view==="comparison"){tables.innerHTML="";return;}
  const parts=[];
  parts.push(tableSection("STAGE 0 - AS CAST DATA (ITD Internal Data only)",m,[["Actual",m.n0]]));
  parts.push(tableSection("STAGE 1 - After Stitching (ITD Internal Data only)",m,[["Actual",m.n1]],{wir:wirText(state.data?.wir,"Stage 1")}));
  parts.push(tableSection("Comparison (Stage 0 - Stage 1, ITD Internal Data only)",m,[["Stage 0 - As Cast",m.n0],["Stage 1 - After Stitching",m.n1],["Diff.",m.d01]]));
  parts.push(tableSection("STAGE 2 - After Stressing (ITD Internal Data only)",m,[["Actual",m.n2]],{wir:wirText(state.data?.wir,"Stage 2")}));
  parts.push(tableSection("Deflection due to stressing (Stage 2 - Stage 1, ITD Internal Data only)",m,[["Stage 1 - After Stitching",m.n1],["Stage 2 - After Stressing",m.n2],["Diff. (mm)",m.d12],["Remark*",m.d12,null,"remark",true]]));
  if(state.view==="final"){
    const rows=[["Design",m.zDesign,v=>cell(v,3)]];
    if(before||both)rows.push(["Final Alignment - Before Joint Check",m.zFinalBefore,v=>cell(v,3)]);
    if(!before||both)rows.push(["Final Alignment - After Joint Check",m.zFinalAfter,v=>cell(v,3)]);
    if(both)rows.push(["Joint Check Correction (mm)",m.finalCorrection]);
    const delta=before?m.finalBeforeVsDesign:m.finalAfterVsDesign;
    rows.push(["Diff. from Design (mm)",delta],["Remark*",delta,null,"remark",true]);
    const badge=(before&&!m.finalBeforeAvailable)?`<span class="dataset-badge pending">No archived Before Joint Check data</span>`:`<span class="dataset-badge">${before?"Before":"After"} Joint Check</span>`;
    parts.push(tableSection(`STAGE 3 - FINAL ALIGNMENT ${badge}`,m,rows,{wir:wirText(state.data?.wir,"Stage 3"),unit:"m / mm"}));
  }else{
    const finalRows=[["Design",m.zDesign,v=>cell(v,3)]];
    if(before||both)finalRows.push(["Final Alignment - Before Joint Check",m.zFinalBefore,v=>cell(v,3)]);
    if(!before||both)finalRows.push(["Final Alignment - After Joint Check",m.zFinalAfter,v=>cell(v,3)]);
    if(both)finalRows.push(["Joint Check Correction (mm)",m.finalCorrection]);
    const finalDelta=before?m.finalBeforeVsDesign:m.finalAfterVsDesign;
    finalRows.push(["Diff. from Design (mm)",finalDelta],["Remark*",finalDelta,null,"remark",true]);
    parts.push(tableSection("STAGE 3 - FINAL ALIGNMENT",m,finalRows,{wir:wirText(state.data?.wir,"Stage 3"),unit:"m / mm"}));
    const rows=[["Design",m.stage4Design,v=>cell(v,3)]];
    if(before||both)rows.push(["Upon Completion - Before Joint Check",m.zUponBefore,v=>cell(v,3)]);
    if(!before||both)rows.push(["Upon Completion - After Joint Check",m.zUponAfter,v=>cell(v,3)]);
    if(both)rows.push(["Joint Check Correction (mm)",m.uponCorrection]);
    const delta=before?m.uponBeforeVsDesign:m.uponAfterVsDesign;
    rows.push(["Diff. from Design (mm)",delta],["Remark*",delta,null,"remark",true]);
    const badge=(before&&!m.uponBeforeAvailable)?`<span class="dataset-badge pending">No archived Before Joint Check data</span>`:`<span class="dataset-badge">${before?"Before":"After"} Joint Check</span>`;
    parts.push(tableSection(`STAGE 4 - UPON COMPLETION OF PARAPET WORKS ${badge}`,m,rows,{wir:wirText(state.data?.wir,"Stage 4"),unit:"m / mm"}));
  }
  tables.innerHTML=parts.join("");
}
function renderBridge(joints){
  const width=1000, left=28, right=972, ys=[42,70,98], labels=["BW","BC","BE"];
  const x=i=>joints.length<=1?width/2:left+(right-left)*i/(joints.length-1);
  let svg=`<svg viewBox="0 0 ${width} 118" role="img" aria-label="${joints.length} joint span layout with BW, BC and BE survey points">`;
  svg+=`<line class="schematic-edge" x1="${left}" y1="24" x2="${right}" y2="24"/>`;
  ys.forEach(y=>svg+=`<line class="schematic-line" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/>`);
  joints.forEach((j,i)=>{
    const xx=x(i);
    svg+=`<text class="joint-label" x="${xx}" y="14" text-anchor="middle">JOINT ${j}</text><line class="schematic-edge" x1="${xx}" y1="24" x2="${xx}" y2="106"/>`;
    ys.forEach((y,k)=>svg+=`<circle class="survey-dot" cx="${xx}" cy="${y}" r="4"/><text class="point-label" x="${xx+6}" y="${y-3}">${j}${labels[k]}</text>`);
  });
  svg+=`<line class="schematic-edge" x1="${left}" y1="106" x2="${right}" y2="106"/></svg>`;
  $("#miniBridge").innerHTML=svg;
}
function renderChart(m){
  const svg=$("#chart"), W=1000,H=330,p={l:58,r:22,t:20,b:42};
  let series=[["Design",m.nDesign,false],["Stage 0 - As Cast",m.n0,false],["Stage 1 - After Stitching",m.n1,false],["Stage 2 - After Stressing",m.n2,false]];
  if(state.revision!=="after")series.push(["Final Alignment - Before Joint Check",m.nFinalBefore,true],["Upon Completion - Before Joint Check",m.nUponBefore,true]);
  if(state.revision!=="before")series.push(["Final Alignment - After Joint Check",m.nFinalAfter,false],["Upon Completion - After Joint Check",m.nUponAfter,false]);
  const vals=series.flatMap(s=>s[1]).filter(v=>v!=null&&Number.isFinite(v));
  let min=Math.min(-10,...vals),max=Math.max(38,...vals); const pad=Math.max(8,(max-min)*.12);min=Math.floor((min-pad)/10)*10;max=Math.ceil((max+pad)/10)*10;
  const x=i=>p.l+(W-p.l-p.r)*(m.joints.length<=1?0:i/(m.joints.length-1)), y=v=>p.t+(H-p.t-p.b)*(max-v)/(max-min);
  let html="";
  const ticks=6;for(let i=0;i<=ticks;i++){const v=min+(max-min)*i/ticks,yy=y(v);html+=`<line class="gridline" x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}"/><text class="axis-text" x="${p.l-8}" y="${yy+4}" text-anchor="end">${v.toFixed(0)}</text>`;}
  html+=`<line class="axis" x1="${p.l}" y1="${p.t}" x2="${p.l}" y2="${H-p.b}"/><line class="axis" x1="${p.l}" y1="${H-p.b}" x2="${W-p.r}" y2="${H-p.b}"/>`;
  m.joints.forEach((j,i)=>html+=`<text class="axis-text" x="${x(i)}" y="${H-p.b+20}" text-anchor="middle">${j}</text>`);
  html+=`<text class="axis-text" x="${W/2}" y="${H-5}" text-anchor="middle">Joint No.</text><text class="axis-text" transform="translate(14 ${H/2}) rotate(-90)" text-anchor="middle">Normalized value (mm)</text>`;
  series.forEach(([name,data,dashed])=>{
    let segment=[];
    const flush=()=>{if(segment.length>1)html+=`<polyline class="series-line" stroke="${COLORS[name]}" ${dashed?'stroke-dasharray="9 6"':''} points="${segment.join(" ")}"/>`;segment=[];};
    data.forEach((v,i)=>{if(v==null){flush();return;}segment.push(`${x(i)},${y(v)}`);html+=`<circle class="series-dot" fill="${COLORS[name]}" cx="${x(i)}" cy="${y(v)}" r="3.3"/>`;});flush();
  });
  svg.innerHTML=html;
  $("#legend").innerHTML=series.map(([name,,dashed])=>`<span><i class="${dashed?'dashed':''}" style="border-color:${COLORS[name]}"></i>${name}</span>`).join("");
}
function render(){
  const m=buildModel(state.data), [a,b]=state.span.replace("P","").split("-");
  $("#pierFrom").textContent=`P-${a}`;$("#pierTo").textContent=`P-${b}`;
  renderTables(m);renderBridge(m.joints);
  const chartSection=$("#chartSection");chartSection.classList.toggle("hidden",state.view!=="comparison");
  if(state.view==="comparison")renderChart(m);
  document.querySelectorAll("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
  document.querySelectorAll("[data-revision]").forEach(b=>b.classList.toggle("active",b.dataset.revision===state.revision));
  const available=[m.finalAfterAvailable,m.uponAfterAvailable,m.finalBeforeAvailable,m.uponBeforeAvailable].filter(Boolean).length;
  const missing=[];if(!m.finalBeforeAvailable)missing.push("Final Before");if(!m.uponBeforeAvailable)missing.push("Upon Before");
  statusBox.className=`status ${missing.length?"warning":"ok"}`;
  statusBox.textContent=`Live data · ${state.point} · ${available}/4 Joint Check datasets available · ${missing.length?"pending: "+missing.join(", "):"all revisions available"} · updated ${state.loadedAt.toLocaleString()}`;
}
function printFileName(){
  const work={
    final:"Final-Alignment",
    upon:"Upon-Completion-of-Parapet-Works",
    comparison:"Comparison-and-Graph"
  }[state.view] || "Camber-Deflection";
  const revision={before:"Before-Joint-Check",after:"After-Joint-Check",both:"Before-and-After-Joint-Check"}[state.revision];
  return `${state.span}_${work}_${state.point}_${revision}`;
}
function printReport(){
  const originalTitle=document.title;
  document.title=printFileName();
  window.addEventListener("afterprint",()=>{document.title=originalTitle;},{once:true});
  window.print();
}
async function refresh(){
  errorPanel.classList.add("hidden");statusBox.className="status loading";statusBox.textContent="Loading live data from Google Sheet...";
  try{state.data=await loadSpanData(state.span);state.loadedAt=new Date();render();}
  catch(err){statusBox.className="status warning";statusBox.textContent="Data could not be refreshed.";errorPanel.textContent=err.message;errorPanel.classList.remove("hidden");}
}
async function init(){
  $("#dateField").textContent=new Date().toLocaleDateString("en-GB");
  $("#printBtn").addEventListener("click",printReport);$("#refreshBtn").addEventListener("click",refresh);
  $("#spanSelect").addEventListener("change",e=>{state.span=e.target.value;refresh();});
  document.querySelectorAll("[data-point]").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll("[data-point]").forEach(b=>b.classList.toggle("active",b===btn));state.point=btn.dataset.point;render();
  }));
  document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{state.view=btn.dataset.view;render();}));
  document.querySelectorAll("[data-revision]").forEach(btn=>btn.addEventListener("click",()=>{state.revision=btn.dataset.revision;render();}));
  try{await loadSpans();await refresh();}catch(err){statusBox.className="status warning";statusBox.textContent="Unable to load the span list.";errorPanel.textContent=err.message;errorPanel.classList.remove("hidden");}
}
init();
