const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={console,document:{querySelector:()=>({addEventListener(){}}),body:{hasAttribute:()=>true}},fetch:async()=>({ok:true,json:async()=>[]})};vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
assert.equal(run('wirSpanKey("P978NB-979NB")'),'P978-979|NB');
assert.equal(run('wirSpanKey("P978-979","NB")'),'P978-979|NB');
assert.equal(run('wirSpanKey("P978-979","SB")'),'P978-979|SB');
assert.equal(run('wirSpanKey("P978-979","ML")'),'P978-979|ML');
assert.equal(run('wirSpanKey("P978NB-979SB")'),'');
assert.equal(run('wirSpanKey("P978NB-979NB","SB")'),'');
assert.equal(run('wirSpanKey("P991-991A","ML")'),'P991-991A|ML');
assert.equal(run('wirSpanKey(" P-991 – P-991A ","ML")'),'P991-991A|ML');
assert.notEqual(run('wirSpanKey("P991-991A","ML")'),run('wirSpanKey("P991-992","ML")'));
for(let pier=826;pier<1142;pier++)for(const line of ['ML','NB','SB']){
  const suffix=line==='ML'?'':line, span=`P${pier}${suffix}-${pier+1}${suffix}`;
  ctx.rangeSpan=span;ctx.rangeBase=`P${pier}-${pier+1}`;ctx.rangeLine=line;
  assert.equal(run('wirSpanKey(rangeSpan)'),run('wirSpanKey(rangeBase,rangeLine)'));
}
ctx.fixture=[['P978-979','Stage 3','NB','033559'],['P978-979','Stage 3','SB','033284'],['P978-979','Stage 3','ML','ML-WIR'],['P978-979','Stage 1','NB','028786']];
run('gviz=async(sheet)=>({rows:(sheet==="WIR"?fixture:[]).map(r=>({c:r.map(v=>({v}))}))})');
(async()=>{for(const [span,expected]of [['P978NB-979NB','NB: 033559'],['P978SB-979SB','SB: 033284'],['P978-979','ML-WIR']]){ctx.span=span;const data=await run('loadSpanData(span)');ctx.result=data;assert.equal(run('wirText(result.wir,"Stage 3")'),expected);}console.log('WIR ML/NB/SB isolation and Stage lookup passed');})();
