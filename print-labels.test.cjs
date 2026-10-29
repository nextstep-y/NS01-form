const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={document:{querySelector:()=>({addEventListener(){}}),body:{hasAttribute:()=>true}},console};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);
for(const revision of ['before','after','both'])for(const label of ['Final Alignment - Before Joint Check','Final Alignment - After Joint Check','Upon · After Joint Check']){
 c.revision=revision;c.label=label;
 const html=vm.runInContext('state.revision=revision;reportLabel(label)',c);
 assert.ok(html.includes(`<span class="screen-only-label">${label}</span>`));
 const printed=html.match(/class="print-only-label">([^<]*)/)[1];
 assert.ok(!/Before Joint Check|After Joint Check/.test(printed));
}
const css=fs.readFileSync(__dirname+'/styles.css','utf8');
assert.ok(css.includes('.print-only-label{display:none}'));
assert.ok(css.includes('.screen-only-label{display:none!important}.print-only-label{display:inline!important}'));
console.log('PASS: screen revision wording preserved, print labels omit joint-check wording');
