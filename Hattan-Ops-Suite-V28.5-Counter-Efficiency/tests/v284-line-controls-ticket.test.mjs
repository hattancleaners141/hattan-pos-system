import fs from 'node:fs';
import assert from 'node:assert/strict';

const js = fs.readFileSync(new URL('../v284-counter-ticket.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../v284-counter-ticket.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const version = fs.readFileSync(new URL('../VERSION.txt', import.meta.url), 'utf8');

const checks = [
  ['V28.4 is loaded after earlier counter layers', html.indexOf('v284-counter-ticket.js') > html.indexOf('v283-guided-counter.js')],
  ['None garment color exists', /GARMENT_COLORS\.push\(\{id:'none',name:'None'/.test(js)],
  ['Multi Color garment option exists', /id:'multicolor',name:'Multi Color'/.test(js)],
  ['None and Multi Color bag options exist', /BAG_COLORS\.push\('None'\)/.test(js) && /BAG_COLORS\.push\('Multi Color'\)/.test(js)],
  ['One-off unit price is editable', /One-Off Unit Price/.test(js) && /v284SetManualPrice/.test(js)],
  ['No Charge Do Over control exists', /NO CHARGE \/ DO OVER/.test(js)],
  ['Condition controls exist', ['STAIN','DELICATE','DEFECTIVE CONDITION'].every(label => js.includes(label))],
  ['Per-line notes exist', /Notes for This Line/.test(js) && /v284SetLineNote/.test(js)],
  ['Apartment is centered and prominent', /\.v284-apartment\{text-align:center;font-size:50px/.test(css)],
  ['Receipt totals reserve right-side clearance', /padding-right:4\.5mm/.test(css) && /white-space:nowrap;text-align:right/.test(css)],
  ['Legacy garment paragraphs split into rows', /raw\.split\(\/\\s\*;\\s\*\//.test(js) && /v284-legacy-line/.test(js)],
  ['Piece count sums line quantities', /reduce\(\(sum,line\)=>sum\+\(Number\(line\.qty\)\|\|0\),0\)/.test(js)],
  ['Version manifest carries V28.4 features into V28.5', /Carried forward from corrected V28\.4/.test(version)]
];

for (const [name, ok] of checks) {
  assert.ok(ok, name);
  console.log(`✓ ${name}`);
}
