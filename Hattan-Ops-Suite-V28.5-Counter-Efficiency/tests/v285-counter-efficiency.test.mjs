import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const js=fs.readFileSync(new URL('../v285-counter-efficiency.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../v285-counter-efficiency.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const version=fs.readFileSync(new URL('../VERSION.txt',import.meta.url),'utf8');

const searchSource=js.slice(js.indexOf('function v285Plain'),js.indexOf('/* Laundered-shirt'));
const searchContext={state:{customers:[],orders:[]},v8CustomerSearchResults:null};
vm.createContext(searchContext);vm.runInContext(searchSource,searchContext);
searchContext.state.customers=[
  {id:'m',name:'Matthew Raber',phone:'2125551000',customerNumber:'C-10004',email:'m@example.com',addresses:[{street:'230 East 15th Street',apartment:'2K'}]},
  {id:'b',name:'Barbara Cohen',phone:'9175552000',customerNumber:'C-10005',email:'b@example.com',addresses:[{street:'10 Park Avenue',apartment:'4A'}]},
  {id:'r',name:'Robert Brown',phone:'6465553000',customerNumber:'C-10006',email:'r@example.com',addresses:[{street:'20 Broadway',apartment:'8B'}]}
];
assert.deepEqual(Array.from(searchContext.v8CustomerSearchResults('B'),x=>x.id),['b','r'],'B matches first or last names beginning with B, not a B inside Raber');
assert.equal(searchContext.v8CustomerSearchResults('Raber Matthew')[0].id,'m','name words match in either order');
assert.equal(searchContext.v8CustomerSearchResults('917555')[0].id,'b','phone prefixes match accurately');
assert.equal(searchContext.v8CustomerSearchResults('(917) 555')[0].id,'b','formatted phone prefixes match accurately');
assert.equal(searchContext.v8CustomerSearchResults('2K')[0].id,'m','apartment remains searchable');

const shirtSource=js.slice(js.indexOf('const v285BaseParseShirts'),js.indexOf('/* Alterations now'));
const shirtContext={
  v10ParseShirts:()=>[{garmentId:'g_lshirt',materialId:'standard',colorId:'white',qty:3,unitPrice:3,buttonType:'standard',garmentNote:'On hanger · Wash & Press · AI voice',serviceType:'shirts'}],
  v10FindColors:()=>['blue','navy','green']
};
vm.createContext(shirtContext);vm.runInContext(shirtSource,shirtContext);
const shirts=shirtContext.v10ParseShirts('3 wash and press shirts blue navy green');
assert.equal(shirts.reduce((sum,item)=>sum+item.qty,0),3,'shirt colors do not multiply the piece count');
assert.deepEqual(Array.from(shirts,item=>item.colorId),['blue','navy','green'],'AI preserves every laundered-shirt color');

const checks=[
  ['V28.5 loads after V28.4',html.indexOf('v285-counter-efficiency.js')>html.indexOf('v284-counter-ticket.js')],
  ['alterations render color choices',/v285SetAlterationColor/.test(js)&&/Garment Color/.test(js)],
  ['shirt UI renders color choices',/v285SetShirtColor/.test(js)&&/Shirt Color/.test(js)],
  ['visit has one-scroll behavior',/\.v285-follow-visit\{[^}]*max-height:none!important;overflow:visible!important/.test(css)],
  ['counter density keeps readable service type',/font-size:14px!important/.test(css)],
  ['V28.5 version is declared',/V28\.5 — Counter Efficiency/.test(version)]
];
for(const [label,ok] of checks){assert.ok(ok,label);console.log(`✓ ${label}`)}
console.log('V28.5 relevance, shirt-color and layout checks passed');
