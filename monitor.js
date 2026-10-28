// All calculations in metres until the explicit conversion to millimetres.
const monitorState={rows:[],loadedAt:null};
function canonicalSpan(value){
 const m=String(value||'').toUpperCase().match(/P-?(\d+[A-Z]*)\s*(?:-|TO)\s*P?-?(\d+[A-Z]*)/);
 return m?`P${m[1]}-${m[2]}`:'';
}
function excess(value,lo,hi){return value==null?null:value>hi+1e-7?value-hi:value<lo-1e-7?value-lo:0;}
function signed(value){return value==null?'—':Math.abs(value)<.0005?'0.000':`${value>0?'+':''}${value.toFixed(3)}`;}
function safe(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function grouped(list,spanColumn,make){const map=new Map();for(const r of list){const span=canonicalSpan(r[spanColumn]);if(!span)continue;if(!map.has(span))map.set(span,new Map());const p=make(r);if(p&&p.z!=null)map.get(span).set(`${p.point}${p.joint}`,p);}return map;}
function coordPoint(r){const p=pointParts(r[1]);return p?{...p,n:num(r[2]),e:num(r[3]),z:num(r[4])}:null;}
function finalPoint(r){const joint=jointNo(r[1]),point=String(r[2]||'').trim().toUpperCase();return joint&&/^(BW|BC|BE)$/.test(point)?{joint,point,z:num(r[3])}:null;}
function applyAfterArchive(groups,archive,stage){for(const r of archive){if(r[0]!==stage||r[1]!=='After Joint Check')continue;const span=canonicalSpan(r[2]),p=pointParts(r[3]);if(!span||!p||num(r[6])==null)continue;if(!groups.has(span))groups.set(span,new Map());groups.get(span).set(`${p.point}${p.joint}`,{...p,n:num(r[4]),e:num(r[5]),z:num(r[6])});}}
function monitorLine(span,line,design,actual,source){
 const ds=[...design.values()].filter(p=>p.point===line).sort((a,b)=>a.joint-b.joint);
 const usable=ds.filter(p=>actual.has(`${line}${p.joint}`));
 // Use cumulative planar design distances. No interpolation or equal-spacing guess.
 const distance=new Map();let chain=0,continuous=true;
 ds.forEach((p,i)=>{if(p.n==null||p.e==null||(p.n===0&&p.e===0))continuous=false;if(i&&continuous)chain+=Math.hypot(p.n-ds[i-1].n,p.e-ds[i-1].e);distance.set(p.joint,continuous?chain:null);});
 const valid=usable.filter(p=>distance.get(p.joint)!=null),first=valid[0],last=valid.at(-1);
 const canNormalize=valid.length>=2&&distance.get(last.joint)>distance.get(first.joint);
 const details=ds.map(p=>{const a=actual.get(`${line}${p.joint}`),elevation=a?(a.z-p.z)*1000:null;let camber=null;
  if(a&&canNormalize&&distance.get(p.joint)!=null){const t=(distance.get(p.joint)-distance.get(first.joint))/(distance.get(last.joint)-distance.get(first.joint));const af=actual.get(`${line}${first.joint}`).z,al=actual.get(`${line}${last.joint}`).z;camber=((a.z-(af+(al-af)*t))-(p.z-(first.z+(last.z-first.z)*t)))*1000;}
  return {joint:p.joint,camber,elevation,camberExcess:excess(camber,0,38),elevationExcess:excess(elevation,-30,30)};});
 const extreme=(field,positive)=>{const values=details.filter(d=>d[field]!=null);if(!values.length)return null;return values.reduce((best,d)=>positive?(d[field]>best[field]?d:best):(d[field]<best[field]?d:best));};
 const pick=(field,pos)=>{const d=extreme(field,pos);return d?{value:pos?Math.max(0,d[field]):Math.min(0,d[field]),joint:d.joint}:null;};
 return {span,line,source,matched:usable.length,total:ds.length,baseline:canNormalize?`J${first.joint}–J${last.joint}`:'Unavailable',details,cp:pick('camberExcess',true),cn:pick('camberExcess',false),ep:pick('elevationExcess',true),en:pick('elevationExcess',false)};
}
function compileMonitor(data){
 const design=grouped(data.design,5,coordPoint),uponDesign=grouped(data.uponDesign,5,coordPoint),upon=grouped(data.upon,5,coordPoint),final=grouped(data.final,0,finalPoint);
 applyAfterArchive(upon,data.archive,'Upon Completion of Parapet Works');applyAfterArchive(final,data.archive,'Final Alignment');
 const spans=[...new Set([...design.keys(),...upon.keys(),...final.keys()])].sort((a,b)=>parseInt(a.slice(1))-parseInt(b.slice(1))||a.localeCompare(b));const out=[];
 for(const span of spans){const hasUpon=(upon.get(span)?.size||0)>0;const actual=(hasUpon?upon:final).get(span)||new Map();const source=hasUpon?'Upon · After Joint Check':actual.size?'Final Alignment · After Joint Check':'No verified actual';const d=hasUpon&&uponDesign.has(span)?uponDesign.get(span):design.get(span)||new Map();for(const line of ['BW','BC','BE'])out.push(monitorLine(span,line,d,actual,source));}return out;
}
function renderMonitor(){const query=$('#monitorSearch').value.trim().toUpperCase(),line=$('#monitorLine').value,only=$('#onlyExceptions').checked;const all=monitorState.rows;const outside=r=>[r.cp,r.cn,r.ep,r.en].some(v=>v&&Math.abs(v.value)>.0000001);const filtered=all.filter(r=>(!query||r.span.includes(query))&&(!line||r.line===line)&&(!only||outside(r)));
 const cell=v=>v?`<td class="${Math.abs(v.value)>.0000001?'excess':'within'}">${signed(v.value)}${v.value?`<small>J${v.joint}</small>`:''}</td>`:'<td>—</td>';
 $('#monitorRows').innerHTML=filtered.map(r=>`<tr><td>${safe(r.span)}</td><td>${r.line}</td><td>${r.source}<small>Camber baseline: ${r.baseline}</small></td><td>${r.matched} / ${r.total}${!r.total?'<small>Design unavailable</small>':''}</td>${cell(r.cp)}${cell(r.cn)}${cell(r.ep)}${cell(r.en)}<td><details><summary>Joint values</summary><table class="joint-detail"><thead><tr><th>Joint</th><th>Camber actual</th><th>Camber excess</th><th>Elev. diff</th><th>Elev. excess</th></tr></thead><tbody>${r.details.map(d=>`<tr><td>${d.joint}</td><td>${signed(d.camber)}</td><td>${signed(d.camberExcess)}</td><td>${signed(d.elevation)}</td><td>${signed(d.elevationExcess)}</td></tr>`).join('')}</tbody></table></details></td></tr>`).join('')||'<tr><td colspan="9">No matching rows.</td></tr>';
 $('#monitorSummary').textContent=`${filtered.length} span/line rows shown · ${filtered.filter(outside).length} outside limits · ${filtered.filter(r=>!r.matched).length} without matched measurements`;
}
async function refreshMonitor(){const status=$('#monitorStatus');status.className='status loading';status.textContent='Loading all spans from source workbook…';try{const tasks=[['design','Span Layout Design','select A,B,C,D,E,F where B is not null'],['uponDesign','UPON DESIGN','select A,B,C,D,E,F where B is not null'],['upon','Upon Completion of Parapet Works','select A,B,C,D,E,F where B is not null and E is not null'],['final','Final Alignment','select A,B,C,D where A is not null'],['archive','Joint Check Revision Archive',"select A,B,C,D,E,F,G,H,I,J,K where B='After Joint Check'"]];const data={};await Promise.all(tasks.map(async([key,sheet,query])=>{data[key]=rows(await gviz(sheet,query));}));monitorState.rows=compileMonitor(data);monitorState.loadedAt=new Date();status.className='status ok';status.textContent=`Live source data · ${new Set(monitorState.rows.map(r=>r.span)).size} spans · refreshed ${monitorState.loadedAt.toLocaleString()}`;renderMonitor();}catch(e){status.className='status warning';status.textContent=`Refresh failed: ${e.message}. Previous values are not marked current.`;}}
$('#monitorRefresh').addEventListener('click',refreshMonitor);for(const id of ['monitorSearch','monitorLine','onlyExceptions'])$('#'+id).addEventListener('input',renderMonitor);refreshMonitor();
