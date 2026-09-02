/* ============================================================================
   HATTAN OPS V28.2 — FAST COUNTER + TAG RULE
   - Physical tags: Dry Cleaning + Alterations only.
   - Laundered Shirts and Wash & Fold never enter Tag Assign.
   - Larger customer lookup / service controls.
   - Dry-clean quantity keypad 1–9.
   - Color is the final click: selecting a color commits the garment automatically.
============================================================================ */

const V28_2_VERSION = 'V28.2 Fast Counter';

/* Only these two service classes receive physical tags. */
v21RequiresTag = function v28RequiresTag(orderOrService) {
  const service = typeof orderOrService === 'string' ? orderOrService : v8OrderService(orderOrService);
  return service === 'dryclean' || service === 'alterations';
};
v17RequiresTag = v21RequiresTag;

/* Replace Tag Assign copy inherited from V21 after every render. */
function v28FixTagCopy(root=document) {
  root.querySelectorAll('.v12-section-head .v2-note').forEach(el => {
    if (/physical tag|wash\s*&\s*fold|shirt on hanger/i.test(el.textContent || '')) {
      el.textContent = 'Only Dry Cleaning and Tailoring / Alterations use one physical tag number. Laundered Shirts and Wash & Fold are excluded.';
    }
  });
  root.querySelectorAll('.v21-simple-tag-note').forEach(el => {
    el.textContent = 'Only Dry Cleaning and Alterations enter this queue.';
  });
  root.querySelectorAll('.table-empty').forEach(el => {
    if (/eligible ticket|wash\s*&\s*fold/i.test(el.textContent || '')) {
      el.textContent = 'Every Dry Cleaning / Alterations ticket has its tag assigned.';
    }
  });
}

/* Quantity keypad is intentionally state-only: no expensive full rerender. */
window.v28SetDryQty = function v28SetDryQty(qty) {
  if (!counterDraft?.builder) return;
  counterDraft.builder.qty = Math.max(1, Number(qty) || 1);
  document.querySelectorAll('.v28-qty-key').forEach(btn => btn.classList.toggle('selected', Number(btn.dataset.qty) === Number(counterDraft.builder.qty)));
  const custom = document.getElementById('v28-custom-qty');
  if (custom && Number(counterDraft.builder.qty) <= 9) custom.value = '';
  const preview = document.querySelector('.v28-qty-readout');
  if (preview) preview.textContent = `Quantity: ${counterDraft.builder.qty}`;
};

window.v28SetDryCustomQty = function v28SetDryCustomQty(value) {
  const qty = Math.max(1, Math.round(Number(value) || 1));
  if (!counterDraft?.builder) return;
  counterDraft.builder.qty = qty;
  document.querySelectorAll('.v28-qty-key').forEach(btn => btn.classList.remove('selected'));
  const preview = document.querySelector('.v28-qty-readout');
  if (preview) preview.textContent = `Quantity: ${qty}`;
};

/* Color is the final dry-clean click. No separate Add to Visit click is required. */
window.v28PickAndAddColor = function v28PickAndAddColor(colorId) {
  if (!counterDraft?.builder) return;
  counterDraft.builder.colorId = colorId;
  if (!counterDraft.builder.garmentId) {
    toast('Choose the garment first', false, 'alerttriangle');
    renderPosContent();
    return;
  }
  v9CommitDryCleaning(false, true);
  toast('Garment added', true, 'checkcircle');
  renderPosContent();
};

function v28QtyPadHTML() {
  const qty = Math.max(1, Math.round(Number(counterDraft?.builder?.qty || 1)));
  return `<div class="v28-step v28-qty-step">
    <div class="v28-step-title"><strong>1. Quantity</strong><span class="v28-qty-readout">Quantity: ${qty}</span></div>
    <div class="v28-qty-pad">${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" class="v28-qty-key ${qty===n?'selected':''}" data-qty="${n}" onclick="v28SetDryQty(${n})">${n}</button>`).join('')}<label class="v28-more-qty"><span>10+</span><input id="v28-custom-qty" type="number" min="10" inputmode="numeric" placeholder="Qty" value="${qty>9?qty:''}" oninput="v28SetDryCustomQty(this.value)"></label></div>
  </div>`;
}

function v28EnhanceFullCounter(content) {
  const mainCard = [...content.querySelectorAll('.pos-card')].find(card => card.querySelector('.v4-service-tabs'));
  if (!mainCard) return;
  content.classList.add('v28-fast-counter');

  /* Customer lookup is intentionally dominant at the top of the workflow. */
  const customerCard = content.querySelector('.v8-customer-card');
  customerCard?.classList.add('v28-customer-lookup-card');
  content.querySelector('.v8-customer-search')?.classList.add('v28-big-search');

  const tabs = mainCard.querySelector('.v4-service-tabs');
  tabs?.classList.add('v28-service-tabs');

  if (counterDraft?.serviceMode !== 'dryclean') return;

  const labels = [...mainCard.querySelectorAll('.field-label')];
  const garmentLabel = labels.find(el => /^1\.\s*Garment/i.test(el.textContent || ''));
  const colorLabel = labels.find(el => /^2\.\s*Color/i.test(el.textContent || ''));
  const colorGrid = colorLabel?.nextElementSibling;
  const details = mainCard.querySelector('details.v8-special-details');
  const builderPreview = mainCard.querySelector('.builder-preview');

  if (garmentLabel && !mainCard.querySelector('.v28-qty-step')) {
    garmentLabel.insertAdjacentHTML('beforebegin', v28QtyPadHTML());
    garmentLabel.textContent = '2. Garment';
  }

  /* Optional details happen before the final color click. */
  if (details) {
    const summary = details.querySelector('summary');
    if (summary) summary.innerHTML = '3. Details / Upcharges <span class="v8-optional">optional — only when needed</span>';
  }

  if (colorLabel && colorGrid) {
    colorLabel.textContent = '4. Color — tap a color to add the garment';
    colorLabel.classList.add('v28-final-step-label');
    colorGrid.classList.add('v28-color-grid');
    colorGrid.querySelectorAll('.color-tile').forEach(tile => {
      const attr = tile.getAttribute('onclick') || '';
      const match = attr.match(/posSetBuilderColor\('([^']+)'\)/);
      if (match) tile.setAttribute('onclick', `v28PickAndAddColor('${match[1]}')`);
    });
    if (details && details.nextSibling !== colorLabel) {
      details.insertAdjacentElement('afterend', colorLabel);
      colorLabel.insertAdjacentElement('afterend', colorGrid);
    }
  }

  if (builderPreview) {
    builderPreview.innerHTML = `<div class="v28-auto-add-help"><strong>No “Add to Visit” button needed.</strong><span>Choose quantity → garment → optional details → color. Tapping the color adds it immediately.</span></div>`;
    builderPreview.classList.add('v28-auto-add-preview');
  }

  mainCard.querySelectorAll('.v4-garment-btn').forEach(el => el.classList.add('v28-garment-btn'));
}

function v28EnhanceSimpleCounter(content) {
  if (!state.simpleMode || state.posNav !== 'counter' || counterDraft?.serviceMode !== 'dryclean') return;
  content.classList.add('v28-fast-counter','v28-simple-fast-counter');
  const search = content.querySelector('.v13-giant-input');
  if (!counterDraft.customerId && !counterDraft.guestName) search?.classList.add('v28-big-search');

  const scanCards = [...content.querySelectorAll('.v13-scan-card')];
  const builder = scanCards.find(card => card.querySelector('.v13-color-grid'));
  if (!builder) return;

  const qtyRow = builder.querySelector('.v13-qty-row');
  if (qtyRow) qtyRow.outerHTML = v28QtyPadHTML();

  builder.querySelectorAll('.v13-color-tile').forEach(tile => {
    const attr = tile.getAttribute('onclick') || '';
    const match = attr.match(/posSetBuilderColor\('([^']+)'\)/);
    if (match) tile.setAttribute('onclick', `v28PickAndAddColor('${match[1]}')`);
  });

  const addButton = [...builder.querySelectorAll('button')].find(btn => /add/i.test(btn.textContent || '') && !btn.classList.contains('v28-qty-key'));
  if (addButton) addButton.outerHTML = `<div class="v28-auto-add-help"><strong>Color = Add</strong><span>Tap the color after choosing the garment and quantity. It goes straight into the visit.</span></div>`;
}

function v28PostRender() {
  const content = document.getElementById('pos-content');
  if (!content) return;
  v28FixTagCopy(content);
  if (state.posNav === 'counter') {
    v28EnhanceFullCounter(content);
    v28EnhanceSimpleCounter(content);
  }
}

const v28BaseRenderPosContent = renderPosContent;
renderPosContent = function v28RenderPosContent() {
  const result = v28BaseRenderPosContent();
  v28PostRender();
  return result;
};
window.renderPosContent = renderPosContent;

/* Correct version label even though V25 migration code renders last. */
if (typeof renderPosRoot === 'function') {
  const v28BaseRenderRoot = renderPosRoot;
  renderPosRoot = function v28RenderRoot() {
    const result = v28BaseRenderRoot();
    document.querySelectorAll('.ps-brand .wordmark small').forEach(el => el.textContent = `Staff POS · ${V28_2_VERSION}`);
    return result;
  };
  window.renderPosRoot = renderPosRoot;
}

/* Fix current DOM when loaded after an already-rendered shell. */
queueMicrotask(v28PostRender);
