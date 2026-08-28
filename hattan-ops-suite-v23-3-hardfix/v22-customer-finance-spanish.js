/* HATTAN OPS V22 — customer finance controls + complete Spanish presentation */
const V22_VERSION = 'V22 Customer Finance + Full Spanish';

function v22CreditAmount(customer) {
  const max = Math.min(Number(customer?.storeCredit || 0), v19DraftSubtotal());
  const requested = Number(counterDraft?.storeCreditAmount || 0);
  return Math.max(0, Math.min(max, requested || max));
}
function v22SetStoreCreditChoice(use) {
  v19EnsureDraft(counterDraft);
  counterDraft.useStoreCredit = !!use;
  const customer = counterDraft.customerId ? customerById(counterDraft.customerId) : null;
  if (use && customer) counterDraft.storeCreditAmount = Math.min(Number(customer.storeCredit || 0), v19DraftSubtotal());
  if (!use) counterDraft.storeCreditAmount = 0;
  renderPosContent();
}
function v22SetStoreCreditAmount(value) {
  const customer = counterDraft.customerId ? customerById(counterDraft.customerId) : null;
  if (!customer) return;
  const max = Math.min(Number(customer.storeCredit || 0), v19DraftSubtotal());
  counterDraft.storeCreditAmount = Math.max(0, Math.min(max, Number(value || 0)));
  counterDraft.useStoreCredit = counterDraft.storeCreditAmount > 0.004;
  renderPosContent();
}
const v22BasePreview = v19DraftPaymentPreview;
v19DraftPaymentPreview = function v22DraftPaymentPreview(customer) {
  const result = v22BasePreview(customer);
  if (!counterDraft?.payNow || !counterDraft?.useStoreCredit || !customer) return result;
  result.credit = v19Round(v22CreditAmount(customer));
  result.externalBase = v19Round(Math.max(0, result.subtotal - result.credit));
  result.fee = counterDraft.paymentMethod === 'card' ? v19Round(result.externalBase * .03) : 0;
  result.externalDue = v19Round(result.externalBase + result.fee);
  result.visitTotal = v19Round(result.subtotal + result.fee);
  return result;
};

v19FinancialPanelHTML = function v22FinancialPanelHTML(customer) {
  if (!customer) return '';
  const outstanding = arBalance(customer.id), credit = Number(customer.storeCredit || 0), preview = v19DraftPaymentPreview(customer);
  const maxCredit = Math.min(credit, preview.subtotal);
  return `<section class="v19-financial-panel v22-financial-panel">
    <div class="v22-account-head"><strong>Customer Account</strong><span>${outstanding > .004 ? `A/R DUE ${money(outstanding)}` : 'A/R PAID'}</span></div>
    <div class="v19-financial-kpis"><div class="${outstanding > .004 ? 'owes' : 'clear'}"><small>Customer owes us</small><strong>${money(outstanding)}</strong></div><div class="${credit > .004 ? 'credit' : 'clear'}"><small>Store credit</small><strong>${money(credit)}</strong></div></div>
    <div class="v19-financial-actions">${outstanding > .004 ? `<button type="button" onclick="posRecordArPayment('${customer.id}')">Pay Balance</button>` : ''}<button type="button" onclick="posOpenStatement('${customer.id}')">View A/R</button><button type="button" onclick="v19TextCustomerReport('${customer.id}')" ${customer.phone ? '' : 'disabled'}>Text Report</button><button type="button" onclick="v19EmailCustomerReport('${customer.id}')" ${customer.email ? '' : 'disabled'}>Email Report</button></div>
    ${counterDraft.payNow && credit > .004 ? `<div class="v19-credit-question"><strong>Use store credit on this visit?</strong><small>${money(credit)} available. Choose all, a custom amount, or keep the credit.</small><div class="segmented"><button class="seg ${!counterDraft.useStoreCredit ? 'selected' : ''}" onclick="v22SetStoreCreditChoice(false)">No — Keep Credit</button><button class="seg ${counterDraft.useStoreCredit ? 'selected' : ''}" onclick="v22SetStoreCreditChoice(true)">Yes — Apply Credit</button></div>${counterDraft.useStoreCredit ? `<div class="v22-credit-custom"><label>Amount to apply</label><div><span>$</span><input type="number" min="0" max="${maxCredit.toFixed(2)}" step="0.01" value="${v22CreditAmount(customer).toFixed(2)}" onchange="v22SetStoreCreditAmount(this.value)"><button type="button" onclick="v22SetStoreCreditAmount(${maxCredit})">Use All ${money(maxCredit)}</button></div></div><div class="v19-credit-preview"><span>Store credit applied <strong>−${money(preview.credit)}</strong></span><span>${counterDraft.paymentMethod === 'card' ? 'Card total after 3% fee' : 'Cash due'} <strong>${money(preview.externalDue)}</strong></span></div>` : ''}</div>` : ''}
  </section>`;
};

/* Full Spanish presentation layer. It translates dynamic Full Mode screens,
   modals and newly rendered controls while leaving customer-entered data intact. */
const V22_ES = new Map(Object.entries({
  'Customer Account':'Cuenta del Cliente','Customer owes us':'El cliente debe','Store credit':'Crédito de tienda','Pay Balance':'Pagar Saldo','View A/R':'Ver CxC','Text Report':'Enviar reporte por texto','Email Report':'Enviar reporte por email','A/R PAID':'CxC PAGADA',
  'Use store credit on this visit?':'¿Usar crédito de tienda en esta visita?','No — Keep Credit':'No — Guardar crédito','Yes — Apply Credit':'Sí — Aplicar crédito','Amount to apply':'Cantidad a aplicar','Payment':'Pago','Pay Later':'Pagar después','Pay Now':'Pagar ahora','Cash':'Efectivo','Card +3%':'Tarjeta +3%',
  'All Customers':'Todos los clientes','Recently Viewed':'Vistos recientemente','Recently Viewed Customers':'Clientes vistos recientemente','View Profile':'Ver perfil','New Customer':'Cliente nuevo','Open Tickets':'Tickets abiertos','Recent History':'Historial reciente','Customer Memo':'Nota del cliente','Previous Tickets':'Tickets anteriores','Delivered Tickets':'Tickets entregados','Customer Notes':'Notas del cliente','Manage Store Credit':'Administrar crédito','Add Card Securely':'Agregar tarjeta segura',
  'Generate Report':'Generar reporte','Customer Account Report':'Reporte de cuenta','Balance owed':'Saldo adeudado','Total Amount Due':'Total adeudado','Record Payment':'Registrar pago','View Customer Profile':'Ver perfil del cliente','Close':'Cerrar',
  'Dry Cleaning':'Limpieza en seco','Wash & Fold':'Lavado y doblado','Laundered Shirts':'Camisas lavadas','Alterations':'Alteraciones','Customer Pickup':'Recogida del cliente','Return Delivery':'Entrega de devolución','Service Instructions & Photos':'Instrucciones y fotos del servicio','Add Photo':'Agregar foto','Preferences / Upcharges':'Preferencias / cargos extra','Pounds':'Libras','Bag Color':'Color de bolsa','No Softener':'Sin suavizante','Low Dry':'Secado bajo','Delicate Cycle':'Ciclo delicado','Separate Darks / Whites':'Separar oscuros / blancos',
  'Ticket List':'Lista de tickets','Tag Assign':'Asignar etiquetas','Rack':'Estante','Delivery':'Entrega','Customers':'Clientes','Payments':'Pagos','Team':'Personal','Catalog':'Catálogo','Marketing':'Marketing','Reports':'Reportes','Settings':'Configuración','To Be Done':'Pendientes','Counter':'Mostrador','Full':'Completo','Simple':'Fácil','Sign Out Register':'Cerrar caja',
  'Search':'Buscar','Save':'Guardar','Cancel':'Cancelar','Back':'Atrás','Edit':'Editar','Delete':'Eliminar','Void':'Anular','Reprint':'Reimprimir','Print':'Imprimir','Add':'Agregar','Remove':'Quitar','Total':'Total','Subtotal':'Subtotal','Discount':'Descuento','Payment Method':'Método de pago','Card':'Tarjeta','Email':'Email','Phone':'Teléfono','Address':'Dirección','Notes':'Notas','Today':'Hoy'
}));
const V22_ES_PHRASES = [
  [/Search recently viewed customers…/g,'Buscar clientes vistos recientemente…'],[/Search customer by name, phone/g,'Buscar cliente por nombre, teléfono'],[/Use All \$/g,'Usar todo $'],[/ available\. Choose all, a custom amount, or keep the credit\./g,' disponible. Elige todo, una cantidad personalizada o conserva el crédito.'],[/Card total after 3% fee/g,'Total de tarjeta después del 3%'],[/Store credit applied/g,'Crédito aplicado'],[/Cash due/g,'Efectivo adeudado'],[/No balance due/g,'Sin saldo pendiente'],[/ open/g,' abiertos'],[/ owed/g,' adeudado'],[/Viewed by /g,'Visto por '],[/Drop Off for /g,'Nueva orden para '],[/Drop Off/g,'Nueva orden']
];
function v22TranslateString(text) {
  let out = String(text || '');
  const trim = out.trim();
  if (V22_ES.has(trim)) return out.replace(trim, V22_ES.get(trim));
  for (const [re, replacement] of V22_ES_PHRASES) out = out.replace(re, replacement);
  return out;
}
function v22TranslateElement(root=document) {
  if (state.language !== 'es' || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => { if (node.parentElement?.closest('script,style,[data-v22-no-translate]')) return; const next=v22TranslateString(node.nodeValue); if(next!==node.nodeValue) node.nodeValue=next; });
  root.querySelectorAll?.('input[placeholder],textarea[placeholder]').forEach(el => { el.placeholder=v22TranslateString(el.placeholder); });
  document.documentElement.lang='es';
}
const v22BaseRenderPosContent = renderPosContent;
renderPosContent = function v22RenderPosContent() { const r=v22BaseRenderPosContent(); queueMicrotask(()=>v22TranslateElement(document.getElementById('pos-root'))); return r; };
const v22BaseOpenPosModal = openPosModal;
openPosModal = function v22OpenPosModal(html) { const r=v22BaseOpenPosModal(html); queueMicrotask(()=>v22TranslateElement(document.getElementById('pos-modal'))); return r; };
const v22BaseSetLanguage = v13SetLanguage;
v13SetLanguage = function v22SetLanguage(lang) { const r=v22BaseSetLanguage(lang); queueMicrotask(()=>{ if(state.language==='es') v22TranslateElement(document.getElementById('pos-root')); else document.documentElement.lang='en'; }); return r; };

/* V21 already records actual profile opens/search selections. Keep that trail
   and make the tab an explicit V22 navigation destination. */
const v22BaseRememberCustomer = v7RememberCustomer;
v7RememberCustomer = function v22RememberCustomer(customerId) { const r=v22BaseRememberCustomer(customerId); state.recentCustomerViews=(state.recentCustomerViews||[]).slice(0,20); return r; };

queueMicrotask(()=>{ if(state.language==='es') v22TranslateElement(document.getElementById('pos-root')); });
