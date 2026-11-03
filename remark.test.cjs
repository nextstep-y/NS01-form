const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={console,document:{querySelector:()=>({addEventListener(){}}),body:{hasAttribute:()=>true}}};
vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);
for(const [v,text,style] of [[-10,'Okay','good'],[-10.00000000002,'Okay','good'],[-10.001,'Sagging','bad'],[-11,'Sagging','bad'],[38,'Okay','good'],[38.001,'Over Camber','over']]){
 c.v=v;assert.equal(vm.runInContext('remark(v)',c),text);assert.equal(vm.runInContext('valClass(v)',c),style);
}
assert.equal(vm.runInContext('remark(null)',c),'–');
console.log('PASS: Sagging below -10 mm; inclusive -10/+38 mm limits and floating-point tolerance');
