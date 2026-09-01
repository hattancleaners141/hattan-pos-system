/* ============================================================================
   V13 ACCESSIBILITY LAYER — bilingual chrome + "Simple Mode"
   Goal: any staff member — regardless of English fluency or reading comfort —
   can run the core counter workflow fast, with large touch targets, icons,
   and a Spanish toggle.

   IMPORTANT DESIGN RULE: this file is a VIEW layer only. It never reimplements
   pricing, ticket creation, tagging, scanning or payment logic — every action
   below calls the exact same functions the full V12 screens already use
   (posSetBuilderGarment, v4AddWashFold, v3SubmitConveyorScan, v12SaveTags,
   posCompleteDropOff, etc.), so Simple Mode and Full Mode always agree.

   Full admin/back-office screens (Catalog, Reports, Settings, Marketing
   composer, A/R, QuickBooks, Ticket List, Team payroll) are NOT rebuilt here —
   they stay in Full Mode only, English content, translated nav/title chrome.
   Simple Mode covers the six screens a line-level associate actually lives
   in all day: New Ticket, Tag Assign, Rack (Ready), Delivery, Pay, and Clock.
============================================================================ */

/* ---------------------------------- I18N ---------------------------------- */
const V13_I18N = {
  en: {
    'nav.counter':'Counter','nav.todo':'To Be Done','nav.orders':'Ticket List','nav.tags':'Tag Assign',
    'nav.rack':'Rack','nav.delivery':'Delivery','nav.customers':'Customers','nav.payments':'Payments',
    'nav.team':'Team','nav.catalog':'Catalog','nav.ar':'A/R','nav.marketing':'Marketing',
    'nav.reports':'Reports','nav.settings':'Settings','nav.pay':'Pay','nav.clock':'Clock','nav.more':'More (Manager)',

    'title.counter':'New Ticket','title.counter.sub':'Ring up a drop-off and hand back a claim ticket',
    'title.todo':'To Be Done','title.todo.sub':'Operational exceptions, overdue work and pending assignments',
    'title.orders':'Ticket List','title.orders.sub':'Search, reprint, void, restore or backtrack every ticket',
    'title.tags':'Tag Assign','title.tags.sub':'Assign physical garment tags after customer intake',
    'title.rack':'Rack & Location','title.rack.sub':'Assign, move and trace the physical location of every order',
    'title.delivery':'Delivery Dashboard','title.delivery.sub':'Assign drivers, track routes, recall or reroute',
    'title.customers':'Customers','title.customers.sub':'Look up accounts, rewards & garment preferences',
    'title.payments':'Payments & Autopay','title.payments.sub':'Charge cards on file, catch missed payments',
    'title.team':'Team & Timeclock','title.team.sub':'Clock activity, payroll estimates, corrections',
    'title.catalog':'Catalog & Pricing','title.catalog.sub':'Edit garment pricing, materials & add new items',
    'title.ar':'Accounts Receivable','title.ar.sub':'Outstanding balances & emailed statements',
    'title.marketing':'Text Marketing','title.marketing.sub':'Campaigns & automated messages',
    'title.reports':'Reports','title.reports.sub':"Today's sales, cash drawer & staff activity",
    'title.settings':'Settings','title.settings.sub':'Configure rack behavior and counter interface order',

    'login.subtitle':'Staff Point of Sale','login.register':'Register','login.staff':'Staff Member',
    'login.selectRegister':'Select a register to begin','login.chooseStaff':'Choose your name to continue',
    'login.needRegister':'Select a register above to continue',
    'login.punchTitle':'Employee Punch Clock','login.punchSub':'Punch in or out without opening a register',
    'login.openClock':'Open Clock','login.language':'Language','login.enterPinFor':'Enter PIN for ',

    'mode.simple':'Simple','mode.full':'Full','mode.managerPinTitle':'Manager PIN',
    'mode.managerPinSub':"Enter a manager's 4-digit PIN to switch to Full Mode.",
    'mode.wrongPin':'Incorrect manager PIN','mode.cancel':'Cancel',

    'simple.customer.title':'Who is this for?','simple.customer.search':'Type name or phone number',
    'simple.customer.walkin':'Walk-in (No Name)','simple.customer.new':'New Customer','simple.customer.change':'Change',
    'simple.service.title':'What service?','simple.service.dryclean':'Dry Cleaning','simple.service.washfold':'Wash & Fold',
    'simple.service.shirts':'Shirts','simple.service.alterations':'Alterations',
    'simple.garment.title':'Pick the garment','simple.color.title':'Pick the color','simple.qty.title':'How many?',
    'simple.pounds.title':'How many pounds?','simple.alteration.title':'Pick the alteration',
    'simple.add':'Add','simple.visit.title':'This Visit','simple.visit.empty':'Nothing added yet',
    'simple.total':'Total','simple.done':'Done — Print','simple.pickup':'Pickup','simple.deliveryOpt':'Delivery',
    'simple.back':'Back','simple.startOver':'Start Over','simple.remove':'Remove',

    'simple.tags.scanTicket':'Scan or type the ticket number','simple.tags.needCount':'tickets need tags',
    'simple.tags.suggested':'Use this tag color','simple.tags.scanTag':'Scan or type a tag number, then press Enter',
    'simple.tags.noneYet':'No tags scanned yet','simple.tags.save':'Save Tags','simple.tags.newTicket':'Scan Next Ticket',
    'simple.tags.notFound':'No ticket found for that scan',

    'simple.rack.scan':'Scan or type the ticket to mark it Ready','simple.rack.markReady':'Mark Ready',
    'simple.rack.recent':'Just marked ready','simple.rack.notFound':'No ticket found for that scan',
    'simple.rack.alreadyDone':'That ticket is already finished',

    'simple.delivery.scan':"Scan today's delivery tickets",'simple.delivery.add':'Add','simple.delivery.print':'Print Route & Send',
    'simple.delivery.clear':'Clear Batch','simple.delivery.empty':'Nothing scanned yet',

    'simple.pay.scan':'Scan or type the ticket to collect payment','simple.pay.due':'Amount Due',
    'simple.pay.cash':'Cash','simple.pay.card':'Card','simple.pay.alreadyPaid':'This ticket is already paid',
    'simple.pay.notFound':'No ticket found for that scan','simple.pay.success':'Payment recorded',

    'simple.punch.enterPin':'Enter your 4-digit PIN','simple.punch.in':'Punch In','simple.punch.out':'Punch Out',
    'common.scanPulse':'Scanner ready',
  },
  es: {
    'nav.counter':'Mostrador','nav.todo':'Pendientes','nav.orders':'Lista de Tickets','nav.tags':'Etiquetas',
    'nav.rack':'Estante','nav.delivery':'Entrega','nav.customers':'Clientes','nav.payments':'Pagos',
    'nav.team':'Personal','nav.catalog':'Catálogo','nav.ar':'Cuentas x Cobrar','nav.marketing':'Marketing',
    'nav.reports':'Reportes','nav.settings':'Configuración','nav.pay':'Cobrar','nav.clock':'Reloj','nav.more':'Más (Gerente)',

    'title.counter':'Ticket Nuevo','title.counter.sub':'Registra una entrega y entrega el ticket',
    'title.todo':'Pendientes','title.todo.sub':'Excepciones y tareas pendientes en tiempo real',
    'title.orders':'Lista de Tickets','title.orders.sub':'Busca, reimprime, anula o restaura cualquier ticket',
    'title.tags':'Asignar Etiquetas','title.tags.sub':'Asigna etiquetas físicas después de recibir la ropa',
    'title.rack':'Estante y Ubicación','title.rack.sub':'Asigna y localiza la ubicación física de cada pedido',
    'title.delivery':'Panel de Entregas','title.delivery.sub':'Asigna conductores y rutas, reasigna pedidos',
    'title.customers':'Clientes','title.customers.sub':'Busca cuentas, puntos y preferencias',
    'title.payments':'Pagos y Cobro Automático','title.payments.sub':'Cobra tarjetas guardadas y revisa pendientes',
    'title.team':'Personal y Reloj','title.team.sub':'Actividad de turnos, nómina y correcciones',
    'title.catalog':'Catálogo y Precios','title.catalog.sub':'Edita precios, materiales y agrega artículos',
    'title.ar':'Cuentas por Cobrar','title.ar.sub':'Saldos pendientes y estados de cuenta',
    'title.marketing':'Marketing por Texto','title.marketing.sub':'Campañas y mensajes automáticos',
    'title.reports':'Reportes','title.reports.sub':'Ventas de hoy, caja y actividad del personal',
    'title.settings':'Configuración','title.settings.sub':'Comportamiento del sistema y orden de botones',

    'login.subtitle':'Punto de Venta','login.register':'Caja','login.staff':'Empleado',
    'login.selectRegister':'Selecciona una caja para comenzar','login.chooseStaff':'Elige tu nombre para continuar',
    'login.needRegister':'Selecciona una caja arriba para continuar',
    'login.punchTitle':'Reloj de Empleados','login.punchSub':'Marca tu entrada o salida sin abrir una caja',
    'login.openClock':'Abrir Reloj','login.language':'Idioma','login.enterPinFor':'Ingresa el PIN de ',

    'mode.simple':'Fácil','mode.full':'Completo','mode.managerPinTitle':'PIN de Gerente',
    'mode.managerPinSub':'Ingresa el PIN de 4 dígitos de un gerente para cambiar a Modo Completo.',
    'mode.wrongPin':'PIN de gerente incorrecto','mode.cancel':'Cancelar',

    'simple.customer.title':'¿Para quién es esto?','simple.customer.search':'Escribe el nombre o teléfono',
    'simple.customer.walkin':'Sin Nombre','simple.customer.new':'Cliente Nuevo','simple.customer.change':'Cambiar',
    'simple.service.title':'¿Qué servicio?','simple.service.dryclean':'Limpieza en Seco','simple.service.washfold':'Lavado y Doblado',
    'simple.service.shirts':'Camisas','simple.service.alterations':'Alteraciones',
    'simple.garment.title':'Elige la prenda','simple.color.title':'Elige el color','simple.qty.title':'¿Cuántos?',
    'simple.pounds.title':'¿Cuántas libras?','simple.alteration.title':'Elige la alteración',
    'simple.add':'Agregar','simple.visit.title':'Esta Visita','simple.visit.empty':'Nada agregado todavía',
    'simple.total':'Total','simple.done':'Terminar — Imprimir','simple.pickup':'Recoger en Tienda','simple.deliveryOpt':'Entrega a Domicilio',
    'simple.back':'Atrás','simple.startOver':'Empezar de Nuevo','simple.remove':'Quitar',

    'simple.tags.scanTicket':'Escanea o escribe el número de ticket','simple.tags.needCount':'tickets necesitan etiquetas',
    'simple.tags.suggested':'Usa este color de etiqueta','simple.tags.scanTag':'Escanea o escribe una etiqueta y presiona Enter',
    'simple.tags.noneYet':'Aún no hay etiquetas escaneadas','simple.tags.save':'Guardar Etiquetas','simple.tags.newTicket':'Escanear Siguiente Ticket',
    'simple.tags.notFound':'No se encontró ningún ticket',

    'simple.rack.scan':'Escanea o escribe el ticket para marcarlo Listo','simple.rack.markReady':'Marcar Listo',
    'simple.rack.recent':'Recién marcado listo','simple.rack.notFound':'No se encontró ningún ticket',
    'simple.rack.alreadyDone':'Ese ticket ya está terminado',

    'simple.delivery.scan':'Escanea los tickets de entrega de hoy','simple.delivery.add':'Agregar','simple.delivery.print':'Imprimir Ruta y Enviar',
    'simple.delivery.clear':'Borrar Lote','simple.delivery.empty':'Nada escaneado todavía',

    'simple.pay.scan':'Escanea o escribe el ticket para cobrar','simple.pay.due':'Monto a Pagar',
    'simple.pay.cash':'Efectivo','simple.pay.card':'Tarjeta','simple.pay.alreadyPaid':'Este ticket ya está pagado',
    'simple.pay.notFound':'No se encontró ningún ticket','simple.pay.success':'Pago registrado',

    'simple.punch.enterPin':'Ingresa tu PIN de 4 dígitos','simple.punch.in':'Marcar Entrada','simple.punch.out':'Marcar Salida',
    'common.scanPulse':'Escáner listo',
  },
};

function t(key, vars) {
  const lang = state.language === 'es' ? 'es' : 'en';
  let s = (V13_I18N[lang] && V13_I18N[lang][key]) || V13_I18N.en[key] || key;
  if (vars) Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(vars[k]); });
  return s;
}

/* Static content data (garment/color/alteration names) translated by id — the
   underlying catalog stays English-only (that's what staff edit in Catalog),
   this is purely a display-layer lookup for Simple Mode and is safe to extend. */
const V13_GARMENT_ES = {
  g_pants:'Pantalón', g_shirt_dc:'Camisa de Vestir', g_blouse:'Blusa', g_sweater:'Suéter', g_dress:'Vestido',
  g_skirt:'Falda', g_suit2:'Traje 2 Piezas', g_jacket:'Chaqueta / Saco', g_coat:'Abrigo', g_tie:'Corbata',
  g_scarf:'Bufanda', g_shorts:'Shorts', g_vest:'Chaleco', g_wf:'Lavado y Doblado', g_lshirt:'Camisa Lavada - Gancho',
  g_lshirt_box:'Camisa Lavada - Caja', g_comforter:'Edredón', g_blanket:'Cobija', g_bathrug:'Tapete de Baño',
  g_curtains:'Cortinas', g_alteration:'Alteración / Reparación',
};
const V13_COLOR_ES = {
  white:'Blanco', ivory:'Marfil', beige:'Beige', tan:'Bronceado', brown:'Café', black:'Negro', gray:'Gris',
  navy:'Azul Marino', blue:'Azul', lightblue:'Azul Claro', green:'Verde', olive:'Verde Olivo', purple:'Morado',
  pink:'Rosa', red:'Rojo', orange:'Naranja', yellow:'Amarillo', print:'Estampado / Multi',
};
const V13_ALTERATION_ES = {
  pants_hem:'Pantalón — Dobladillo', pants_waist:'Pantalón — Ajustar Cintura', pants_zipper:'Pantalón — Cambiar Cierre',
  pants_seam:'Pantalón — Reparar Costura', dress_hem:'Vestido — Dobladillo', dress_zipper:'Vestido — Cambiar Cierre',
  dress_seam:'Vestido — Reparar Costura', jacket_sleeve:'Chaqueta — Acortar Mangas', jacket_button:'Chaqueta — Cambiar Botón',
  shirt_button:'Camisa — Cambiar Botón', shirt_seam:'Camisa — Reparar Costura', coat_zipper:'Abrigo — Cambiar Cierre',
  general_patch:'Otro — Parchar Hoyo', general_hook:'Otro — Gancho y Ojal', general_custom:'Otro — Personalizado / Cotizar',
};
function v13GarmentName(id) { const g = garmentById(id); if (!g) return ''; return state.language === 'es' ? (V13_GARMENT_ES[id] || g.name) : g.name; }
function v13ColorName(id) { const c = colorById(id); if (!c) return ''; return state.language === 'es' ? (V13_COLOR_ES[id] || c.name) : c.name; }
function v13AlterationName(id) { const a = ALTERATION_VARIANTS.find((x) => x.id === id); if (!a) return ''; return state.language === 'es' ? (V13_ALTERATION_ES[id] || a.name) : a.name; }

/* ---------------------------- STATE + PERSISTENCE ---------------------------- */
function v13EnsureData() {
  if (state.language !== 'en' && state.language !== 'es') state.language = 'en';
  if (typeof state.simpleMode !== 'boolean') state.simpleMode = false;
}
const v13BaseSaveState = saveState;
saveState = function v13SaveState() {
  v13BaseSaveState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    raw.language = state.language; raw.simpleMode = state.simpleMode;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
  } catch (e) { /* storage unavailable */ }
};
const v13BaseLoadState = loadState;
loadState = function v13LoadState() {
  v13BaseLoadState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (raw.language) state.language = raw.language;
    if (typeof raw.simpleMode === 'boolean') state.simpleMode = raw.simpleMode;
  } catch (e) { /* ignore corrupt optional data */ }
  v13EnsureData();
};

/* ---------------------------- LANGUAGE + MODE actions ---------------------------- */
function v13SetLanguage(lang) { state.language = lang === 'es' ? 'es' : 'en'; saveState(); renderPosRoot(); }
function v13SetSimpleMode() { state.simpleMode = true; state.posNav = 'counter'; saveState(); renderPosRoot(); }
function v13RequestFullMode() {
  openPosModal(`
    <h3>${icon('lock', 17)} ${t('mode.managerPinTitle')}</h3>
    <p class="pm-sub">${t('mode.managerPinSub')}</p>
    <div class="v13-pin-display" id="v13-mgr-pin-dots">${[0,1,2,3].map(() => '<i></i>').join('')}</div>
    <div class="v13-pin-pad">
      ${[1,2,3,4,5,6,7,8,9].map((n) => `<button onclick="v13MgrPinPress('${n}')">${n}</button>`).join('')}
      <button onclick="v13MgrPinBack()">${icon('chevronleft', 18)}</button>
      <button onclick="v13MgrPinPress('0')">0</button>
      <button style="visibility:hidden"></button>
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:14px" onclick="closePosModal()">${t('mode.cancel')}</button>
  `);
  v13MgrPin = '';
}
let v13MgrPin = '';
function v13RenderMgrPinDots() {
  const el = document.getElementById('v13-mgr-pin-dots'); if (!el) return;
  el.innerHTML = [0,1,2,3].map((i) => `<i class="${i < v13MgrPin.length ? 'filled' : ''}"></i>`).join('');
}
function v13MgrPinPress(d) {
  if (v13MgrPin.length >= 4) return;
  v13MgrPin += d; v13RenderMgrPinDots();
  if (v13MgrPin.length === 4) v13SubmitMgrPin();
}
function v13MgrPinBack() { v13MgrPin = v13MgrPin.slice(0, -1); v13RenderMgrPinDots(); }
function v13SubmitMgrPin() {
  const isManager = (state.staff || []).some((s) => s.manager && String(s.pin) === v13MgrPin);
  if (!isManager) { toast(t('mode.wrongPin'), false, 'alerttriangle'); v13MgrPin = ''; v13RenderMgrPinDots(); return; }
  state.simpleMode = false; saveState(); closePosModal(); renderPosRoot();
}

/* ---------------------------- LOGIN SCREEN: language toggle ---------------------------- */
const v13BasePosLoginHTML = posLoginHTML;
posLoginHTML = function v13PosLoginHTML() {
  let html = v13BasePosLoginHTML();
  if (state.language === 'es') {
    html = html
      .replaceAll('Staff Point of Sale', t('login.subtitle'))
      .replaceAll('>Register<', '>' + t('login.register') + '<')
      .replaceAll('>Staff Member<', '>' + t('login.staff') + '<')
      .replaceAll('Select a register to begin', t('login.selectRegister'))
      .replaceAll('Choose your name to continue', t('login.chooseStaff'))
      .replaceAll('Select a register above to continue', t('login.needRegister'))
      .replaceAll('Enter PIN for ', t('login.enterPinFor'))
      .replaceAll('Employee Punch Clock', t('login.punchTitle'))
      .replaceAll('Punch in or out without opening a register', t('login.punchSub'))
      .replaceAll('>Open Clock<', '>' + t('login.openClock') + '<');
  }
  const marker = '\n    </div>\n  </div>';
  const index = html.lastIndexOf(marker);
  const langToggle = `<div class="v13-login-row"><div class="v13-lang-toggle" style="flex:1">
    <button class="v13-lang-btn ${state.language !== 'es' ? 'active' : ''}" onclick="v13SetLanguage('en')">English</button>
    <button class="v13-lang-btn ${state.language === 'es' ? 'active' : ''}" onclick="v13SetLanguage('es')">Español</button>
  </div></div>`;
  if (index < 0) return html + langToggle;
  return html.slice(0, index) + langToggle + html.slice(index);
};

/* ---------------------------- FULL-MODE SHELL: translate nav + inject toggles ---------------------------- */
const v13BasePosShellHTML = posShellHTML;
posShellHTML = function v13PosShellHTML() {
  if (state.simpleMode) return v13SimpleShellHTML();
  const staff = staffById(state.session.staffId);
  const navHTML = POS_NAV_ITEMS.map((n) => `<button class="${state.posNav === n.id ? 'active' : ''}" onclick="posGoTo('${n.id}')">${icon(n.icon, 17)}<span>${t('nav.' + n.id)}</span></button>`).join('');
  return `
  <div class="pos-shell">
    <aside class="pos-sidebar">
      <div class="ps-brand"><div class="logo-mark" style="width:30px;height:30px;"></div><div class="wordmark">Hattan Cleaners<small>Staff POS · V13</small></div></div>
      <nav class="pos-nav">${navHTML}</nav>
      <div class="pos-sidebar-foot">
        <div class="v13-lang-pill">
          <button class="${state.language !== 'es' ? 'active' : ''}" onclick="v13SetLanguage('en')">EN</button>
          <button class="${state.language === 'es' ? 'active' : ''}" onclick="v13SetLanguage('es')">ES</button>
        </div>
        <div class="v13-mode-toggle">
          <button class="v13-mode-btn active" disabled>${icon('grid', 14)}<span>${t('mode.full')}</span></button>
          <button class="v13-mode-btn" onclick="v13SetSimpleMode()">${icon('zap', 14)}<span>${t('mode.simple')}</span></button>
        </div>
        <div class="pos-staff-chip"><div class="avatar">${staff.initials}</div><div><strong>${esc(staff.name)}</strong><span>${esc(state.session.register)} · In since ${esc(state.session.clockInTime)}</span></div></div>
        <button class="pos-signout" onclick="posSignOut()">${icon('logout', 14)} Sign Out Register</button>
      </div>
    </aside>
    <div class="pos-main">
      <div class="pos-topbar">
        <div><h1 id="pos-title"></h1><div class="pt-sub" id="pos-sub"></div></div>
        <div class="pos-topbar-right"><span class="conn-pill-slot">${connPillHTML()}</span></div>
      </div>
      <div class="pos-content" id="pos-content"></div>
    </div>
  </div>`;
};

/* ---------------------------- SIMPLE-MODE SHELL ---------------------------- */
const V13_SIMPLE_NAV = [
  { id: 'counter', icon: 'plus', key: 'nav.counter' },
  { id: 'tags', icon: 'tag', key: 'nav.tags' },
  { id: 'rack', icon: 'box', key: 'nav.rack' },
  { id: 'delivery', icon: 'truck', key: 'nav.delivery' },
  { id: 'v13pay', icon: 'creditcard', key: 'nav.pay' },
];
function v13SimpleShellHTML() {
  const staff = staffById(state.session.staffId);
  const navHTML = V13_SIMPLE_NAV.map((n) => `<button class="${state.posNav === n.id ? 'active' : ''}" onclick="posGoTo('${n.id}')"><span class="v13-nav-ic">${icon(n.icon, 18)}</span>${t(n.key)}</button>`).join('')
    + `<button onclick="v12OpenPunchClock()"><span class="v13-nav-ic">${icon('clock', 18)}</span>${t('nav.clock')}</button>`;
  return `
  <div class="pos-shell">
    <aside class="pos-sidebar">
      <div class="ps-brand"><div class="logo-mark" style="width:30px;height:30px;"></div><div class="wordmark">Hattan Cleaners<small>${t('mode.simple')}</small></div></div>
      <nav class="v13-simple-nav">${navHTML}</nav>
      <button class="v13-simple-more" onclick="v13RequestFullMode()">${icon('lock', 13)} ${t('nav.more')}</button>
      <div class="pos-sidebar-foot">
        <div class="v13-lang-pill">
          <button class="${state.language !== 'es' ? 'active' : ''}" onclick="v13SetLanguage('en')">EN</button>
          <button class="${state.language === 'es' ? 'active' : ''}" onclick="v13SetLanguage('es')">ES</button>
        </div>
        <div class="pos-staff-chip"><div class="avatar">${staff.initials}</div><div><strong>${esc(staff.name)}</strong><span>${esc(state.session.register)}</span></div></div>
        <button class="pos-signout" onclick="posSignOut()">${icon('logout', 14)} Sign Out</button>
      </div>
    </aside>
    <div class="pos-main">
      <div class="pos-content" id="pos-content" style="padding-top:26px;"></div>
    </div>
  </div>`;
}

/* ---------------------------- DISPATCH ---------------------------- */
const V13_SIMPLE_SCREENS = ['counter', 'tags', 'rack', 'delivery', 'v13pay'];
const v13BaseRenderPosContent = renderPosContent;
renderPosContent = function v13RenderPosContent() {
  if (!state.session?.loggedIn) return;
  if (state.simpleMode && V13_SIMPLE_SCREENS.includes(state.posNav)) {
    const content = document.getElementById('pos-content'); if (!content) return;
    document.querySelectorAll('.v13-simple-nav button').forEach((b, i) => b.classList.toggle('active', V13_SIMPLE_NAV[i] && V13_SIMPLE_NAV[i].id === state.posNav));
    if (state.posNav === 'counter') v13RenderSimpleCounter(content);
    else if (state.posNav === 'tags') v13RenderSimpleTags(content);
    else if (state.posNav === 'rack') v13RenderSimpleRack(content);
    else if (state.posNav === 'delivery') v13RenderSimpleDelivery(content);
    else if (state.posNav === 'v13pay') v13RenderSimplePay(content);
    return;
  }
  v13BaseRenderPosContent();
  if (state.language === 'es') {
    const titleEl = document.getElementById('pos-title');
    const subEl = document.getElementById('pos-sub');
    if (titleEl && V13_I18N.es['title.' + state.posNav]) titleEl.textContent = V13_I18N.es['title.' + state.posNav];
    if (subEl && V13_I18N.es['title.' + state.posNav + '.sub']) subEl.innerHTML = V13_I18N.es['title.' + state.posNav + '.sub'];
  }
};

/* ============================================================================
   SIMPLE COUNTER — reuses posCustomerSearch/counterDraft/posSetBuilderGarment/
   posAddGarmentToTicket/v4AddWashFold/etc. exactly as Full Mode does.
============================================================================ */
function v13Head(titleKey) {
  return `<div class="v13-simple-head"><h2>${t(titleKey)}</h2></div>`;
}
function v13RenderSimpleCounter(content) {
  if (!counterDraft) counterDraft = freshCounterDraft();
  const d = counterDraft;
  const selectedCust = d.customerId ? customerById(d.customerId) : null;
  const results = posCustomerSearch.trim() ? v8CustomerSearchResults(posCustomerSearch) : [];
  const base = v8DraftBaseTotal() + v9PendingSubtotal();

  let customerBlock;
  if (selectedCust) {
    customerBlock = `<div class="v13-cust-row" style="cursor:default">
      <div class="avatar">${esc(selectedCust.initials)}</div>
      <div style="flex:1"><strong>${esc(selectedCust.name)}</strong><small>${esc(selectedCust.phone)}</small></div>
      <button class="v13-giant-btn ghost sm" style="width:auto;padding:12px 18px" onclick="posClearCustomer()">${t('simple.customer.change')}</button>
    </div>`;
  } else if (d.guestName) {
    customerBlock = `<div class="v13-cust-row" style="cursor:default">
      <div class="avatar">${icon('user', 20)}</div>
      <div style="flex:1"><strong>${esc(d.guestName)}</strong><small>${t('simple.customer.walkin')}</small></div>
      <button class="v13-giant-btn ghost sm" style="width:auto;padding:12px 18px" onclick="posSetGuestName('');renderPosContent();">${t('simple.customer.change')}</button>
    </div>`;
  } else {
    customerBlock = `
      <input class="v13-giant-input" placeholder="${t('simple.customer.search')}" value="${esc(posCustomerSearch)}" oninput="posCustomerSearchInput(this.value)">
      ${results.length ? `<div style="margin-top:12px">${results.map((c) => `<div class="v13-cust-row" onclick="posPickCustomer('${c.id}')"><div class="avatar">${esc(c.initials)}</div><div style="flex:1"><strong>${esc(c.name)}</strong><small>${esc(c.phone)}</small></div>${icon('chevronright', 20)}</div>`).join('')}</div>` : ''}
      <div class="v13-tile-grid cols-2" style="margin-top:14px">
        <button class="v13-giant-btn ghost" onclick="posSetGuestName('Walk-in Guest');renderPosContent();">${icon('user', 18)} ${t('simple.customer.walkin')}</button>
        <button class="v13-giant-btn ghost" onclick="posOpenNewCustomer()">${icon('plus', 18)} ${t('simple.customer.new')}</button>
      </div>`;
  }

  const serviceOrder = [
    { id: 'dryclean', icon: 'shirt', key: 'simple.service.dryclean' },
    { id: 'washfold', icon: 'droplet', key: 'simple.service.washfold' },
    { id: 'shirts', icon: 'shirt', key: 'simple.service.shirts' },
    { id: 'alterations', icon: 'scissors', key: 'simple.service.alterations' },
  ];
  const serviceTiles = serviceOrder.map((s) => `<div class="v13-tile ${d.serviceMode === s.id ? 'selected' : ''}" onclick="v4SetService('${s.id}')"><div class="v13-tile-ic">${icon(s.icon, 26)}</div><strong>${t(s.key)}</strong></div>`).join('');

  let builderBlock = '';
  if (d.serviceMode === 'dryclean') {
    const popular = (state.interfaceSettings?.drycleanOrder || []).slice(0, 8);
    const garmentTiles = popular.map((id) => { const g = garmentById(id); if (!g) return ''; return `<div class="v13-tile ${d.builder.garmentId === id ? 'selected' : ''}" onclick="posSetBuilderGarment('${id}')"><div class="v13-tile-ic">${icon('shirt', 24)}</div><strong>${esc(v13GarmentName(id))}</strong><span class="v13-tile-price">${money(g.basePrice)}</span></div>`; }).join('');
    const colorTiles = GARMENT_COLORS.map((c) => `<div class="v13-color-tile ${d.builder.colorId === c.id ? 'selected' : ''}" onclick="posSetBuilderColor('${c.id}')"><span class="v13-swatch" style="background:${c.sw}"></span><strong>${esc(v13ColorName(c.id))}</strong></div>`).join('');
    builderBlock = `
      <div class="v13-scan-card" style="text-align:left">
        <div class="v13-scan-label">${t('simple.garment.title')}</div>
        <div class="v13-tile-grid">${garmentTiles}</div>
        <div class="v13-scan-label" style="margin-top:6px">${t('simple.color.title')}</div>
        <div class="v13-color-grid">${colorTiles}</div>
        <div class="v13-qty-row">
          <button class="v13-qty-btn" onclick="posBuilderQty(-1)">−</button>
          <div class="v13-qty-num">${d.builder.qty}</div>
          <button class="v13-qty-btn" onclick="posBuilderQty(1)">+</button>
        </div>
        <button class="v13-giant-btn primary" ${!d.builder.garmentId ? 'disabled' : ''} onclick="posAddGarmentToTicket()">${icon('plus', 20)} ${t('simple.add')}</button>
      </div>`;
  } else if (d.serviceMode === 'washfold') {
    builderBlock = `
      <div class="v13-scan-card">
        <div class="v13-scan-label">${t('simple.pounds.title')}</div>
        <input class="v13-giant-input" type="number" step=".1" inputmode="decimal" placeholder="13.0" value="${esc(d.wf.pounds)}" oninput="v4SetWfField('pounds',this.value)">
        <button class="v13-giant-btn primary" style="margin-top:16px" onclick="v4AddWashFold()">${icon('plus', 20)} ${t('simple.add')}</button>
      </div>`;
  } else if (d.serviceMode === 'shirts') {
    builderBlock = `
      <div class="v13-scan-card">
        <div class="v13-scan-label">${t('simple.qty.title')}</div>
        <div class="v13-qty-row">
          <button class="v13-qty-btn" onclick="v4SetShirtQty(-1)">−</button>
          <div class="v13-qty-num">${d.shirts.qty}</div>
          <button class="v13-qty-btn" onclick="v4SetShirtQty(1)">+</button>
        </div>
        <button class="v13-giant-btn primary" onclick="v4AddLaunderedShirts()">${icon('plus', 20)} ${t('simple.add')}</button>
      </div>`;
  } else {
    const alterationTiles = (state.interfaceSettings?.alterationOrder || []).slice(0, 9).map((id) => { const a = ALTERATION_VARIANTS.find((x) => x.id === id); if (!a) return ''; return `<div class="v13-tile ${d.alteration.variantId === id ? 'selected' : ''}" onclick="v4SetAlterVariant('${id}')"><div class="v13-tile-ic">${icon('scissors', 22)}</div><strong>${esc(v13AlterationName(id))}</strong><span class="v13-tile-price">${a.price ? money(a.price) : '—'}</span></div>`; }).join('');
    builderBlock = `
      <div class="v13-scan-card" style="text-align:left">
        <div class="v13-scan-label">${t('simple.alteration.title')}</div>
        <div class="v13-tile-grid">${alterationTiles}</div>
        <div class="v13-qty-row">
          <button class="v13-qty-btn" onclick="v4SetAlterQty(-1)">−</button>
          <div class="v13-qty-num">${d.alteration.qty}</div>
          <button class="v13-qty-btn" onclick="v4SetAlterQty(1)">+</button>
        </div>
        <button class="v13-giant-btn primary" onclick="v4AddAlteration()">${icon('plus', 20)} ${t('simple.add')}</button>
      </div>`;
  }

  const visitRows = d.items.map((it, idx) => {
    const g = garmentById(it.garmentId); if (!g) return '';
    const isWeight = v8ServiceForItem ? v8ServiceForItem(it) === 'washfold' : it.serviceType === 'washfold';
    return `<div class="v13-visit-row">
      <div class="v13-tile-ic">${icon(g.icon || 'shirt', 20)}</div>
      <div class="v13-visit-row-main"><strong>${esc(v13GarmentName(it.garmentId))}</strong><small>${it.qty} ${isWeight ? 'lb' : '×'} ${money(it.unitPrice)}</small></div>
      <div class="v13-visit-price">${money(it.unitPrice * it.qty)}</div>
      <button class="v13-visit-remove" onclick="posRemoveItem(${idx})">${icon('x', 14)}</button>
    </div>`;
  }).join('');

  content.innerHTML = `
    <div class="v13-simple-wrap">
      ${v13Head('simple.customer.title')}
      <div class="v13-scan-card" style="text-align:left">${customerBlock}</div>

      ${v13Head('simple.service.title')}
      <div class="v13-tile-grid" style="grid-template-columns:repeat(4,1fr)">${serviceTiles}</div>

      ${builderBlock}

      <div class="v13-visit-card" style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0;font-size:19px">${t('simple.visit.title')}</h3>
          <div class="v13-tile-grid cols-2" style="margin:0;gap:8px">
            <button class="v13-giant-btn sm ${d.fulfillment !== 'delivery' ? 'primary' : 'ghost'}" style="width:auto;padding:10px 16px" onclick="v3SetFulfillment('pickup')">${icon('box', 15)} ${t('simple.pickup')}</button>
            <button class="v13-giant-btn sm ${d.fulfillment === 'delivery' ? 'primary' : 'ghost'}" style="width:auto;padding:10px 16px" onclick="v3SetFulfillment('delivery')">${icon('truck', 15)} ${t('simple.deliveryOpt')}</button>
          </div>
        </div>
        ${d.items.length ? visitRows : `<div class="helper-text" style="padding:16px 0">${t('simple.visit.empty')}</div>`}
        <div class="v13-total-banner"><span>${t('simple.total')}</span><strong>${money(base)}</strong></div>
        <button class="v13-giant-btn primary" ${d.items.length ? '' : 'disabled'} onclick="posCompleteDropOff()">${icon('checkcircle', 22)} ${t('simple.done')}</button>
      </div>
    </div>`;
}

/* ============================================================================
   SIMPLE TAG ASSIGN — reuses v3FindOrderByScan/v12TagColor/v12NormalizeTag/
   v12SaveTags exactly. Renders hidden inputs matching v12's expected DOM ids
   so the real save/collision/history logic runs unmodified.
============================================================================ */
let v13TagState = { order: null, tags: [] };
function v13RenderSimpleTags(content) {
  const needCount = state.orders.filter((o) => v12IsOpen(o) && !(o.tagNumbers || []).length).length;
  const order = v13TagState.order;
  let body;
  if (!order) {
    body = `<div class="v13-scan-card">
      <div class="v13-scan-label">${t('simple.tags.scanTicket')}</div>
      <input id="v13-tag-scan" class="v13-giant-input" autocomplete="off" placeholder="•••••" onkeydown="v13TagScanKeydown(event)">
      <div class="v13-scan-pulse"><span></span>${needCount} ${t('simple.tags.needCount')}</div>
    </div>`;
  } else {
    const color = v12TagColor(order);
    const chips = v13TagState.tags.map((tag, i) => `<div class="v13-tag-chip">${esc(tag)}<button onclick="v13RemoveScannedTag(${i})">${icon('x', 12)}</button></div>`).join('');
    const hiddenInputs = Array.from({ length: 5 }, (_, i) => `<input type="hidden" id="${v12TagInputId(order, i)}" value="${esc(v13TagState.tags[i] || '')}">`).join('');
    body = `<div class="v13-scan-card" style="text-align:left">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><strong style="font-size:19px">#${esc(order.ticket || order.id)}</strong><div class="row-sub">${esc(customerLabel(order))} · ${esc(V8_SERVICE_NAMES[v8OrderService(order)] || '')}</div></div>
        <div class="v13-suggested-color"><span class="v13-swatch" style="background:${color.hex}"></span>${esc(color.name)} — ${t('simple.tags.suggested')}</div>
      </div>
      <input type="hidden" id="${v12TagColorId(order)}" value="${esc(color.name)}">
      <div class="v13-scan-label" style="margin-top:18px">${t('simple.tags.scanTag')}</div>
      <input id="v13-tag-value" class="v13-giant-input" autocomplete="off" placeholder="•••" onkeydown="v13TagValueKeydown(event)">
      <div class="v13-tag-chip-row">${chips.length ? chips : `<span class="helper-text">${t('simple.tags.noneYet')}</span>`}</div>
      ${hiddenInputs}
      <div class="v13-tile-grid cols-2" style="margin-top:10px">
        <button class="v13-giant-btn ghost" onclick="v13CancelTagTicket()">${t('simple.back')}</button>
        <button class="v13-giant-btn primary" ${v13TagState.tags.length ? '' : 'disabled'} onclick="v13SaveSimpleTags()">${icon('checkcircle', 20)} ${t('simple.tags.save')}</button>
      </div>
    </div>`;
  }
  content.innerHTML = `<div class="v13-simple-wrap">${v13Head('nav.tags')}${body}</div>`;
  setTimeout(() => document.getElementById(order ? 'v13-tag-value' : 'v13-tag-scan')?.focus(), 0);
}
function v13TagScanKeydown(e) {
  if (e.key !== 'Enter') return; e.preventDefault();
  const value = String(e.currentTarget.value || '').trim(); if (!value) return;
  const order = v3FindOrderByScan(value);
  if (!order) { toast(t('simple.tags.notFound'), false, 'alerttriangle'); e.currentTarget.value = ''; return; }
  v13TagState = { order, tags: (order.tagNumbers || []).slice() };
  renderPosContent();
}
function v13TagValueKeydown(e) {
  if (e.key !== 'Enter') return; e.preventDefault();
  const tag = v12NormalizeTag(e.currentTarget.value); if (!tag) return;
  if (v13TagState.tags.length >= 5) { toast('Max 5 tags per ticket', false, 'alerttriangle'); return; }
  if (!v13TagState.tags.includes(tag)) v13TagState.tags.push(tag);
  renderPosContent();
}
function v13RemoveScannedTag(i) { v13TagState.tags.splice(i, 1); renderPosContent(); }
function v13CancelTagTicket() { v13TagState = { order: null, tags: [] }; renderPosContent(); }
function v13SaveSimpleTags() {
  if (!v13TagState.order) return;
  const orderId = v13TagState.order.id;
  v13TagState = { order: null, tags: [] };
  v12SaveTags(orderId);
}

/* ============================================================================
   SIMPLE RACK — reuses conveyorScanState + v3SubmitConveyorScan exactly.
============================================================================ */
function v13RenderSimpleRack(content) {
  const justScanned = conveyorScanState.scanned.map((id) => state.orders.find((o) => o.id === id)).filter(Boolean);
  content.innerHTML = `<div class="v13-simple-wrap">
    ${v13Head('nav.rack')}
    <div class="v13-scan-card">
      <div class="v13-scan-label">${t('simple.rack.scan')}</div>
      <input id="v13-rack-scan" class="v13-giant-input" autocomplete="off" placeholder="•••••" value="${esc(conveyorScanState.input)}" oninput="conveyorScanState.input=this.value" onkeydown="v13RackScanKeydown(event)">
      <button class="v13-giant-btn primary" style="margin-top:16px" onclick="v13RackScanSubmit()">${icon('checkcircle', 20)} ${t('simple.rack.markReady')}</button>
      <div class="v13-scan-pulse"><span></span>${t('common.scanPulse')}</div>
    </div>
    ${justScanned.length ? `<div class="v13-visit-card"><h3 style="margin-top:0;font-size:17px">${t('simple.rack.recent')}</h3>${justScanned.slice(-8).reverse().map((o) => `<div class="v13-visit-row"><div class="v13-tile-ic">${icon('checkcircle', 18)}</div><div class="v13-visit-row-main"><strong>#${esc(o.ticket || o.id)}</strong><small>${esc(customerLabel(o))}</small></div></div>`).join('')}</div>` : ''}
  </div>`;
  setTimeout(() => document.getElementById('v13-rack-scan')?.focus(), 0);
}
function v13RackScanKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); v13RackScanSubmit(); } }
function v13RackScanSubmit() {
  const raw = conveyorScanState.input;
  const order = v3FindOrderByScan(raw);
  if (!order) { toast(t('simple.rack.notFound'), false, 'alerttriangle'); conveyorScanState.input = ''; renderPosContent(); return; }
  if (['picked_up', 'delivered', 'voided'].includes(order.status)) { toast(t('simple.rack.alreadyDone'), false, 'alerttriangle'); conveyorScanState.input = ''; renderPosContent(); return; }
  v3SubmitConveyorScan();
}

/* ============================================================================
   SIMPLE DELIVERY — reuses state.deliveryUi + v8SubmitDeliveryScan/
   v8DeliveryGroupsHTML/v8PrintDeliveryBatch exactly.
============================================================================ */
function v13RenderSimpleDelivery(content) {
  const scanned = v8ScannedDeliveryOrders();
  content.innerHTML = `<div class="v13-simple-wrap">
    ${v13Head('nav.delivery')}
    <div class="v13-scan-card">
      <div class="v13-scan-label">${t('simple.delivery.scan')}</div>
      <input id="v13-delivery-scan" class="v13-giant-input" autocomplete="off" placeholder="•••••" value="${esc(state.deliveryUi.input)}" oninput="v8DeliverySetInput(this.value)" onkeydown="v13DeliveryScanKeydown(event)">
      <div class="v13-tile-grid cols-2" style="margin-top:16px">
        <button class="v13-giant-btn primary" onclick="v8SubmitDeliveryScan()">${icon('plus', 18)} ${t('simple.delivery.add')}</button>
        <button class="v13-giant-btn ghost" ${scanned.length ? '' : 'disabled'} onclick="v8ClearDeliveryBatch()">${t('simple.delivery.clear')}</button>
      </div>
    </div>
    ${scanned.length ? `<div class="v13-visit-card">${v8DeliveryGroupsHTML(scanned)}<button class="v13-giant-btn primary" style="margin-top:14px" onclick="v8PrintDeliveryBatch()">${icon('printer', 18)} ${t('simple.delivery.print')}</button></div>` : `<div class="helper-text" style="padding:10px 0">${t('simple.delivery.empty')}</div>`}
  </div>`;
  setTimeout(() => document.getElementById('v13-delivery-scan')?.focus(), 0);
}
function v13DeliveryScanKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); v8SubmitDeliveryScan(); } }

/* ============================================================================
   SIMPLE PAY — looks up a ticket by scan/search, shows amount due, collects
   Cash or Card. Mirrors v8RecordPayment's exact field-set (paid, paymentMethod,
   paidAt, activity log, recordSync) but re-renders the Simple screen instead
   of jumping to the Customer Profile view the way the Full-Mode button does.
============================================================================ */
let v13PayOrderId = null;
function v13RenderSimplePay(content) {
  const order = v13PayOrderId ? state.orders.find((o) => o.id === v13PayOrderId) : null;
  let body;
  if (!order) {
    body = `<div class="v13-scan-card">
      <div class="v13-scan-label">${t('simple.pay.scan')}</div>
      <input id="v13-pay-scan" class="v13-giant-input" autocomplete="off" placeholder="•••••" onkeydown="v13PayScanKeydown(event)">
    </div>`;
  } else {
    const due = Math.max(0, (order.total || 0) - (order.discount || 0));
    if (order.paid) {
      body = `<div class="v13-scan-card">
        <div style="font-size:18px;font-weight:800">#${esc(order.ticket || order.id)} · ${esc(customerLabel(order))}</div>
        <div class="helper-text" style="margin:14px 0">${t('simple.pay.alreadyPaid')}</div>
        <button class="v13-giant-btn ghost" onclick="v13PayReset()">${t('simple.back')}</button>
      </div>`;
    } else {
      body = `<div class="v13-scan-card">
        <div style="font-size:18px;font-weight:800">#${esc(order.ticket || order.id)} · ${esc(customerLabel(order))}</div>
        <div class="v13-total-banner"><span>${t('simple.pay.due')}</span><strong>${money(due)}</strong></div>
        <div class="v13-tile-grid cols-2">
          <button class="v13-giant-btn primary" onclick="v13SimplePay('${order.id}','cash')">${icon('cash', 20)} ${t('simple.pay.cash')}</button>
          <button class="v13-giant-btn primary" onclick="v13SimplePay('${order.id}','card')">${icon('creditcard', 20)} ${t('simple.pay.card')}</button>
        </div>
        <button class="v13-giant-btn ghost" style="margin-top:10px" onclick="v13PayReset()">${t('simple.back')}</button>
      </div>`;
    }
  }
  content.innerHTML = `<div class="v13-simple-wrap">${v13Head('nav.pay')}${body}</div>`;
  setTimeout(() => document.getElementById('v13-pay-scan')?.focus(), 0);
}
function v13PayScanKeydown(e) {
  if (e.key !== 'Enter') return; e.preventDefault();
  const value = String(e.currentTarget.value || '').trim(); if (!value) return;
  const order = v3FindOrderByScan(value);
  if (!order) { toast(t('simple.pay.notFound'), false, 'alerttriangle'); e.currentTarget.value = ''; return; }
  v13PayOrderId = order.id; renderPosContent();
}
function v13PayReset() { v13PayOrderId = null; renderPosContent(); }
function v13SimplePay(orderId, method) {
  const o = state.orders.find((x) => x.id === orderId); if (!o || o.paid) return;
  const base = Math.max(0, (o.total || 0) - (o.discount || 0));
  if (method === 'card') { o.surcharge = Math.round(base * 0.03 * 100) / 100; o.amountCharged = base + o.surcharge; }
  o.paid = true; o.paymentMethod = method; o.paidAt = v8NowISO();
  if (o.customerId && !o.pointsAwarded) { const cust = customerById(o.customerId); if (cust) { cust.points += Math.round(base); o.pointsAwarded = true; } }
  v8AddActivity(o, 'payment', `Payment recorded · ${money(base + (o.surcharge || 0))}`);
  recordSync(`Balance marked paid · ${o.id} · ${method}`);
  saveState();
  toast(t('simple.pay.success'), true, 'checkcircle');
  renderPosContent();
}

/* ============================================================================
   Giant on-screen PIN pad for the shared Employee Punch Clock, replacing the
   plain text-input modal with the same big-button pattern as staff login.
   Still calls the real v12SubmitPunch() for validation/persistence.
============================================================================ */
let v13PunchPinDraft = '';
v12PunchPin = function v13PunchPin(staffId) {
  const staff = staffById(staffId); if (!staff) return;
  const open = v12OpenPunchForStaff(staff);
  const action = open ? t('simple.punch.out') : t('simple.punch.in');
  v13PunchPinDraft = '';
  openPosModal(`
    <h3>${action} · ${esc(staff.name)}</h3>
    <p class="pm-sub">${t('simple.punch.enterPin')}</p>
    <div class="v13-pin-display" id="v13-punch-pin-dots">${[0,1,2,3].map(() => '<i></i>').join('')}</div>
    <div class="v13-pin-pad">
      ${[1,2,3,4,5,6,7,8,9].map((n) => `<button onclick="v13PunchPinPress('${staffId}','${n}')">${n}</button>`).join('')}
      <button onclick="v13PunchPinBack()">${icon('chevronleft', 18)}</button>
      <button onclick="v13PunchPinPress('${staffId}','0')">0</button>
      <button style="visibility:hidden"></button>
    </div>
    <button class="btn btn-ghost btn-block" style="margin-top:12px" onclick="v12OpenPunchClock()">${t('simple.back')}</button>
  `);
};
function v13PunchPinBack() { v13PunchPinDraft = v13PunchPinDraft.slice(0, -1); const el = document.getElementById('v13-punch-pin-dots'); if (el) el.innerHTML = [0,1,2,3].map((i) => `<i class="${i < v13PunchPinDraft.length ? 'filled' : ''}"></i>`).join(''); }
function v13PunchPinPress(staffId, d) {
  if (v13PunchPinDraft.length >= 4) return;
  v13PunchPinDraft += d;
  const el = document.getElementById('v13-punch-pin-dots'); if (el) el.innerHTML = [0,1,2,3].map((i) => `<i class="${i < v13PunchPinDraft.length ? 'filled' : ''}"></i>`).join('');
  if (v13PunchPinDraft.length === 4) {
    // v12SubmitPunch reads the pin from #v12-punch-pin — provide it a matching hidden input.
    let hidden = document.getElementById('v12-punch-pin');
    if (!hidden) {
      hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.id = 'v12-punch-pin';
      document.body.appendChild(hidden);
    }
    hidden.value = v13PunchPinDraft;
    v12SubmitPunch(staffId);
  }
}

/* ---------------------------------- INIT ---------------------------------- */
v13EnsureData();
saveState();
renderPosRoot();
