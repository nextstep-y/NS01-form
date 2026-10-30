const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={console,document:{querySelector:()=>({addEventListener(){}}),body:{hasAttribute:()=>true}}};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);
c.piers=require('./project-chainage.json');
// Drawing control points, N/E. No synthetic equally-spaced geometry.
c.cases=[['P904-905',70600,70640,[[1671909.667,459147.004],[1671942.053,459124.130]]],['P988-989',73830,73870,[[1673967.138,456728.634],[1673987.736,456694.755]]],['P1108-1109',78376,78416,[[1678029.576,454954.775],[1678068.133,454945.417]]]];
vm.runInContext(`for(const [span,start,end,points] of cases){const d=new Map(points.map((p,i)=>['BW'+(i?17:1),{n:p[0],e:p[1]}]));const xs=chainage(d,new Map(),[1,17],'BW',span,piers);if(xs.some(x=>x==null)||Math.abs(xs[0]-start)>1||Math.abs(xs[1]-end)>1||xs[1]<=xs[0])throw Error(span+': invalid drawing chainage '+xs);console.log(span,xs.map(chainageText));}`,c);
assert.match(fs.readFileSync(__dirname+'/app.js','utf8'),/project-chainage.json\?v=20261030-1/);
console.log('PASS: three drawing reference spans and cache version');
