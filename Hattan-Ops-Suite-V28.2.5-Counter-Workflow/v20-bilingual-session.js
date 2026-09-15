/* ============================================================================
   HATTAN OPS V20 — BILINGUAL COUNTER + ATOMIC SESSION RESTORE

   Wash & Fold instructions render English with bold Chinese directly below.
   Secure reloads remain behind one boot screen until the final authenticated
   counter (or the real server staff sign-in screen) is ready to paint.
============================================================================ */

const V20_VERSION = 'V20 Bilingual Session';
const V20_WASHFOLD_INSTRUCTIONS = {
  fragrancefree:{ label:'Fragrance-free detergent', zh:'无香洗衣液' },
  separate:{ label:'Separate darks & whites', zh:'深色与白色分开' },
  nosoftener:{ label:'No fabric softener', zh:'不使用柔顺剂' },
  lowdry:{ label:'Low dry', zh:'低温烘干' },
  coldwash:{ label:'Cold wash', zh:'冷水洗涤' },
  delicate:{ label:'Delicate cycle', zh:'轻柔洗涤' },
  hangdry:{ label:'Hang dry selected pieces', zh:'选定衣物悬挂晾干' },
};

function v20EnsureBilingualData() {
  const rows = V14_SERVICE_INSTRUCTIONS.washfold || (V14_SERVICE_INSTRUCTIONS.washfold = []);
  Object.entries(V20_WASHFOLD_INSTRUCTIONS).forEach(([id, defaults]) => {
    let row = rows.find(item => item.id === id);
    if (!row) {
      row = { id, label:defaults.label };
      rows.push(row);
    } else row.label = defaults.label;
  });

  state.v14InstructionOrder = state.v14InstructionOrder || v14CloneInstructionOrder();
  state.v14InstructionOrder.washfold = state.v14InstructionOrder.washfold || [];
  Object.keys(V20_WASHFOLD_INSTRUCTIONS).forEach(id => {
    if (!state.v14InstructionOrder.washfold.includes(id)) state.v14InstructionOrder.washfold.push(id);
  });

  state.workflowSettings = state.workflowSettings || {};
  if (typeof state.workflowSettings.showChineseAtCounter !== 'boolean') {
    state.workflowSettings.showChineseAtCounter = true;
  }
  state.instructionTranslations = state.instructionTranslations || {};
  state.instructionTranslations.washfold = state.instructionTranslations.washfold || {};
  Object.entries(V20_WASHFOLD_INSTRUCTIONS).forEach(([id, defaults]) => {
    const current = state.instructionTranslations.washfold[id];
    state.instructionTranslations.washfold[id] = {
      zh:String(current?.zh || defaults.zh),
      enabled:typeof current?.enabled === 'boolean' ? current.enabled : true,
    };
  });
  if (counterDraft) {
    v14EnsureDraft(counterDraft);
    if (counterDraft.instructionOpen.washfold === undefined) counterDraft.instructionOpen.washfold = true;
  }
}

const v20BaseSaveState = saveState;
saveState = function v20SaveState() {
  v20EnsureBilingualData();
  return v20BaseSaveState();
};

const v20BaseLoadState = loadState;
loadState = function v20LoadState() {
  const result = v20BaseLoadState();
  v20EnsureBilingualData();
  return result;
};

if (typeof v16ApplySnapshot === 'function') {
  const v20BaseApplySnapshot = v16ApplySnapshot;
  v16ApplySnapshot = function v20ApplySnapshot(snapshot, shouldRender = true) {
    v20BaseApplySnapshot(snapshot, false);
    v20EnsureBilingualData();
    if (shouldRender) v16SafeRender();
  };
}

function v20CounterChineseVisible() {
  return state.workflowSettings?.showChineseAtCounter !== false;
}

function v20ToggleCounterChinese() {
  v20EnsureBilingualData();
  state.workflowSettings.showChineseAtCounter = !v20CounterChineseVisible();
  saveState();
  renderPosContent();
}

/* Generate the bilingual buttons at the source. This avoids timing-dependent
   DOM matching and guarantees the Chinese line exists on the first render. */
const v20BaseServiceInstructionHTML = v14ServiceInstructionHTML;
v14ServiceInstructionHTML = function v20ServiceInstructionHTML(service) {
  if (service !== 'washfold') return v20BaseServiceInstructionHTML(service);
  v20EnsureBilingualData();
  v14EnsureDraft(counterDraft);
  const selected = counterDraft.serviceInstructions.washfold || [];
  const open = !!counterDraft.instructionOpen.washfold;
  const custom = counterDraft.serviceInstructionNotes.washfold || '';
  const showChinese = v20CounterChineseVisible();
  const rows = v14InstructionRows('washfold');
  return `<div class="v14-instructions v20-washfold-instructions">
    <div class="v14-instruction-head v20-instruction-head">
      <strong>Special instructions · Wash &amp; Fold</strong>
      <div class="v20-instruction-actions">
        <button class="v20-zh-toggle ${showChinese ? 'on' : ''}" type="button" aria-pressed="${showChinese}" onclick="v20ToggleCounterChinese()"><span>中文</span> under English</button>
        <button class="v14-instruction-toggle" type="button" onclick="v14ToggleInstructionPanel('washfold')">${open ? 'Hide choices' : 'Show choices'}</button>
      </div>
    </div>
    ${open ? `<div class="v14-instruction-options v20-instruction-options">${rows.map(row => `<button class="v14-instruction-chip v20-bilingual-instruction ${selected.includes(row.id) ? 'selected' : ''}" type="button" onclick="v14ToggleInstruction('washfold','${row.id}')"><span class="v20-instruction-en">${esc(row.label)}</span>${showChinese && row.zh ? `<strong class="v20-instruction-zh v17-instruction-zh" lang="zh-Hans">${esc(row.zh)}</strong>` : ''}</button>`).join('')}</div>` : ''}
    <div class="v17-free-instruction"><input id="v17-free-instruction" class="text-input v14-instruction-custom" placeholder="Type any Wash &amp; Fold instruction…" value="${esc(custom)}" oninput="v14SetInstructionNote('washfold',this.value)"><button class="btn btn-ghost" type="button" onclick="document.getElementById('v17-free-instruction')?.focus()">Shift to type</button></div>
  </div>`;
};

/* The upper Preferences / Upcharges buttons use a separate legacy renderer.
   Decorate those exact options too, without touching other service buttons. */
const V20_UPCHARGE_ALIASES = [
  { id:'lowdry', patterns:['low dry'] },
  { id:'nosoftener', patterns:['no softener','no fabric softener'] },
  { id:'delicate', patterns:['delicate cycle'] },
  { id:'hangdry', patterns:['hang dry'] },
  { id:'separate', patterns:['separate darks / whites','separate darks & whites'] },
];

function v20DecorateWashFoldUpcharges(content) {
  if (!content || counterDraft?.serviceMode !== 'washfold' || !v20CounterChineseVisible()) return;
  content.querySelectorAll('.v4-option,.v14-instruction-chip:not(.v20-bilingual-instruction)').forEach(node => {
    if (node.querySelector('.v20-option-zh,.v19-option-zh,.v17-instruction-zh')) return;
    const text = String(node.textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const match = V20_UPCHARGE_ALIASES.find(entry => entry.patterns.some(pattern => text.startsWith(pattern)));
    if (!match) return;
    node.insertAdjacentHTML('beforeend', `<strong class="v20-option-zh" lang="zh-Hans">${esc(V20_WASHFOLD_INSTRUCTIONS[match.id].zh)}</strong>`);
  });
}

const v20BaseEnhanceCounter = v17EnhanceCounter;
v17EnhanceCounter = function v20EnhanceCounter(content) {
  v20EnsureBilingualData();
  v20BaseEnhanceCounter(content);
  v20DecorateWashFoldUpcharges(content);
};

/* Recognize Cold wash when it comes from typed/voice production details. */
const v20BaseTranslateProductionDetail = v17TranslateProductionDetail;
v17TranslateProductionDetail = function v20TranslateProductionDetail(text) {
  const translated = v20BaseTranslateProductionDetail(text);
  if (!state.workflowSettings?.printChineseInstructions || !/cold\s+wash/i.test(String(text || ''))) return translated;
  return [...new Set([translated, V20_WASHFOLD_INSTRUCTIONS.coldwash.zh].filter(Boolean))].join(' · ');
};

/* -------------------------- ATOMIC SECURE RELOAD -------------------------- */
let v20BootPending = true;

function v20LoadingHTML() {
  return `<div class="v18-loading-shell v20-loading-shell"><div><div class="spinner"></div><strong>Refreshing Hattan POS…</strong><div class="v20-loading-note">Checking the secure session and newest counter information.</div></div></div>`;
}

const v20BaseRenderPosRoot = renderPosRoot;
renderPosRoot = function v20RenderPosRoot() {
  if (v20BootPending) {
    const root = document.getElementById('pos-root');
    if (root) root.innerHTML = v20LoadingHTML();
    return;
  }
  return v20BaseRenderPosRoot();
};

/* Always bypass browser caches for safe live reads during a refresh. */
const v20BaseApi = v16Api;
v16Api = function v20Api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  return v20BaseApi(path, method === 'GET' ? { ...options, cache:'no-store' } : options);
};

function v20AfterFinalPaint() {
  return new Promise(resolve => {
    const raf = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
    raf(() => raf(resolve));
  });
}

const v20BaseBoot = v16Boot;
v16Boot = async function v20Boot() {
  v20BootPending = true;
  document.documentElement.classList.add('v20-booting');
  try {
    await v20BaseBoot();
  } finally {
    v20EnsureBilingualData();
    v20BootPending = false;
    const setupGate = document.querySelector('#pos-root .v16-setup-gate');
    if (!setupGate) v20BaseRenderPosRoot();
    await v20AfterFinalPaint();
    document.documentElement.classList.remove('v20-booting', 'v18-booting', 'v17-booting');
    document.getElementById('v17-boot-screen')?.remove();
  }
};

/* If networking stalls, retain the secure boot screen rather than revealing a
   stale prototype page. The existing Retry button remains available. */
window.setTimeout(() => {
  if (!v20BootPending) return;
  const message = document.getElementById('v18-boot-message');
  const retry = document.getElementById('v18-boot-retry');
  if (message) message.textContent = 'Still refreshing the secure Hattan POS…';
  if (retry) retry.hidden = false;
}, 15000);

v20EnsureBilingualData();
