import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../v20-bilingual-session.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../v20-bilingual-session.css', import.meta.url), 'utf8');

function runtime() {
  const root = { innerHTML:'' };
  const bootScreen = { removed:false, remove() { this.removed = true; } };
  const classes = new Set(['v20-booting']);
  let context;
  context = vm.createContext({
    console,
    V14_SERVICE_INSTRUCTIONS:{ washfold:[
      { id:'fragrancefree', label:'Fragrance-free detergent' },
      { id:'separate', label:'Separate darks & whites' },
      { id:'nosoftener', label:'No fabric softener' },
      { id:'lowdry', label:'Low dry' },
      { id:'hangdry', label:'Hang dry selected pieces' },
    ] },
    state:{
      workflowSettings:{ printChineseInstructions:true },
      instructionTranslations:{ washfold:{} },
      v14InstructionOrder:{ washfold:['fragrancefree','separate','nosoftener','lowdry','hangdry'] },
      session:{ loggedIn:false },
    },
    counterDraft:{
      serviceMode:'washfold',
      serviceInstructions:{ washfold:['lowdry','coldwash'] },
      serviceInstructionNotes:{ washfold:'' },
      instructionOpen:{ washfold:true },
    },
    paints:[], safeRenders:0, contentRenders:0,
    v14CloneInstructionOrder:() => ({ washfold:[] }),
    v14EnsureDraft:draft => draft,
    saveState:() => {}, loadState:() => {},
    v16ApplySnapshot:snapshot => {
      Object.assign(context.state, snapshot);
    },
    v16SafeRender:() => { context.safeRenders += 1; },
    v14ServiceInstructionHTML:service => `<div>${service}</div>`,
    v14InstructionRows:service => {
      const translations = context.state.instructionTranslations?.[service] || {};
      return (context.state.v14InstructionOrder?.[service] || []).map(id => {
        const row = context.V14_SERVICE_INSTRUCTIONS[service].find(item => item.id === id);
        return row ? { ...row, ...(translations[id] || {}) } : null;
      }).filter(Boolean);
    },
    esc:value => String(value ?? ''),
    renderPosContent:() => { context.contentRenders += 1; },
    v17EnhanceCounter:() => {},
    v17TranslateProductionDetail:() => '',
    renderPosRoot:() => { context.paints.push(context.state.session.loggedIn ? 'counter' : 'login'); },
    v16Api:async () => ({ ok:true }),
    v16Boot:async () => {
      context.state.session = { loggedIn:true, staffId:'staff_real' };
      context.renderPosRoot();
    },
    document:{
      documentElement:{ classList:{
        add:(...names) => names.forEach(name => classes.add(name)),
        remove:(...names) => names.forEach(name => classes.delete(name)),
      } },
      getElementById:id => id === 'pos-root' ? root : (id === 'v17-boot-screen' ? bootScreen : null),
      querySelector:() => null,
    },
    window:{
      setTimeout:() => 0,
      requestAnimationFrame:callback => callback(),
    },
  });
  vm.runInContext(source, context, { filename:'v20-bilingual-session.js' });
  return { context, root, bootScreen, classes };
}

test('Wash & Fold buttons render English with bold Chinese directly underneath', () => {
  const { context } = runtime();
  const html = vm.runInContext("v14ServiceInstructionHTML('washfold')", context);
  const expected = [
    ['Fragrance-free detergent','无香洗衣液'],
    ['Separate darks & whites','深色与白色分开'],
    ['No fabric softener','不使用柔顺剂'],
    ['Low dry','低温烘干'],
    ['Cold wash','冷水洗涤'],
    ['Delicate cycle','轻柔洗涤'],
    ['Hang dry selected pieces','选定衣物悬挂晾干'],
  ];
  expected.forEach(([english, chinese]) => {
    assert.ok(html.includes(english) || html.includes(english.replace(/[&]/g, '&amp;')));
    assert.match(html, new RegExp(chinese));
  });
  assert.match(html, /v20-instruction-zh/);
  assert.match(html, /中文<\/span> under English/);
  assert.match(styles, /font-weight:1000!important/);
});

test('Chinese counter display defaults on and can be toggled without changing print translations', () => {
  const { context } = runtime();
  assert.equal(context.state.workflowSettings.showChineseAtCounter, true);
  vm.runInContext('v20ToggleCounterChinese()', context);
  assert.equal(context.state.workflowSettings.showChineseAtCounter, false);
  assert.equal(context.state.workflowSettings.printChineseInstructions, true);
  const html = vm.runInContext("v14ServiceInstructionHTML('washfold')", context);
  assert.doesNotMatch(html, /v20-instruction-zh/);
});

test('shared snapshots are migrated before rendering, including Cold wash', () => {
  const { context } = runtime();
  vm.runInContext("v16ApplySnapshot({ workflowSettings:{ printChineseInstructions:true }, instructionTranslations:{ washfold:{} }, v14InstructionOrder:{ washfold:['lowdry'] } }, true)", context);
  assert.equal(context.state.instructionTranslations.washfold.coldwash.zh, '冷水洗涤');
  assert.equal(context.state.workflowSettings.showChineseAtCounter, true);
  assert.ok(context.state.v14InstructionOrder.washfold.includes('coldwash'));
  assert.equal(context.safeRenders, 1);
});

test('reload never paints a login page before the restored counter', async () => {
  const { context, root, bootScreen, classes } = runtime();
  await vm.runInContext('v16Boot()', context);
  assert.deepEqual(Array.from(context.paints), ['counter']);
  assert.match(root.innerHTML, /Refreshing Hattan POS/);
  assert.equal(classes.has('v20-booting'), false);
  assert.equal(bootScreen.removed, true);
});

test('the earliest inline boot rule hides every stale page, not just its visibility', () => {
  assert.match(index, /classList\.add\('v17-booting','v18-booting','v20-booting'\)/);
  assert.match(index, /html\.v20-booting body > :not\(#v17-boot-screen\)\{display:none!important\}/);
  assert.match(index, /v20-bilingual-session\.css/);
  assert.match(index, /v20-bilingual-session\.js/);
  assert.match(source, /cache:'no-store'/);
  assert.match(source, /await v20AfterFinalPaint\(\)/);
});
