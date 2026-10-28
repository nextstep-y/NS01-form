const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={document:{querySelector:()=>({addEventListener(){}}),body:{hasAttribute:()=>true}},console};vm.createContext(context);
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/monitor.js','utf8').replace(/refreshMonitor\(\);\s*$/,''),context);
vm.runInContext(`
if(excess(50,0,38)!==12||excess(-5,0,38)!==-5||excess(40,-30,30)!==10||excess(-40,-30,30)!==-10||excess(null,0,38)!==null)throw Error('Limits');
const design=new Map([1,2,3].map(j=>['BC'+j,{joint:j,point:'BC',n:j,e:1,z:100}]));
const actual=new Map([1,2,3].map(j=>['BC'+j,{joint:j,point:'BC',z:100+(j===2?.05:0)}]));
const result=monitorLine('P1-2','BC',design,actual,'test');
if(Math.abs(result.cp.value-12)>1e-8||Math.abs(result.ep.value-20)>1e-8)throw Error('Chord or elevation');
// Constant datum shift cancels out of camber but remains in elevation.
actual.forEach(p=>p.z+=.1);const shifted=monitorLine('P1-2','BC',design,actual,'test');
if(Math.abs(shifted.cp.value-12)>1e-8||Math.abs(shifted.ep.value-120)>1e-8)throw Error('Datum cancellation');
if(canonicalSpan('P-977NB  to P-978NB')!=='P977NB-978NB')throw Error('Span label');
const ds=[1,2,3].map(j=>[1,j+'BCP-1',j,1,100,'SPAN P1-2']);
const payload={design:ds,uponDesign:[],upon:[],final:[['P1-2','JOINT 2','BC',100.04]],archive:[]};
let compiled=compileMonitor(payload).find(r=>r.line==='BC');if(!compiled.source.startsWith('Final')||compiled.ep.value<9.999)throw Error('Final fallback');
payload.upon=[[1,'1BCP-1',1,1,100,'SPAN P1-2']];compiled=compileMonitor(payload).find(r=>r.line==='BC');
if(!compiled.source.startsWith('Upon')||compiled.matched!==1||compiled.cp!==null)throw Error('No point-level mixing');
payload.archive=[['Upon Completion of Parapet Works','Before Joint Check','P1-2','2BCP-1',2,1,101]];
if(compileMonitor(payload).find(r=>r.line==='BC').matched!==1)throw Error('Before excluded');
console.log('PASS: limits, chords, datum cancellation, aliases, source fallback, missing data, before exclusion');
const duplicateRows=[[1,'1BCP-1',10,20,100,'SPAN P1-2'],[1,'1BCP-1',0,0,100,'SPAN P1-2'],[1,'2BCP-1',11,21,100,'SPAN P1-2'],[1,'2BCP-1',11,null,100,'SPAN P1-2']];
const g=grouped(duplicateRows,5,coordPoint).get('P1-2');if(g.get('BC1').n!==10||g.get('BC1').e!==20||g.get('BC2').e!==21||g.conflicts.size)throw Error('Complete coordinates must survive incomplete duplicates');
const conflict=grouped([...duplicateRows,[1,'1BCP-1',10,22,100,'SPAN P1-2']],5,coordPoint).get('P1-2');if(!conflict.conflicts.has('BC1'))throw Error('Conflicting coordinates must be flagged');
console.log('PASS: incomplete duplicates merged; conflicting duplicates flagged');
`,context);
