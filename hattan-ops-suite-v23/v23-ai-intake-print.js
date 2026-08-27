/* Hattan Ops Suite V23 — incremental AI typed intake + natural dates + one-ticket-at-a-time printing */
(function () {
  'use strict';

  const V23_WEEKDAYS = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };

  function v23LocalISO(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function v23Today() {
    const d = new Date();
    d.setHours(12,0,0,0);
    return d;
  }
  function v23DatePlus(days) {
    const d = v23Today();
    d.setDate(d.getDate() + days);
    return v23LocalISO(d);
  }
  function v23NextWeekday(weekday, forceNextWeek) {
    const d = v23Today();
    if (forceNextWeek) {
      // Monday of next calendar week, then advance to the requested weekday.
      const mondayOffset = ((8 - d.getDay()) % 7) || 7;
      d.setDate(d.getDate() + mondayOffset);
      const mondayIndex = 1;
      d.setDate(d.getDate() + ((weekday - mondayIndex + 7) % 7));
      return v23LocalISO(d);
    }
    let delta = (weekday - d.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    d.setDate(d.getDate() + delta);
    return v23LocalISO(d);
  }
  function v23NaturalDate(text) {
    let cleaned = String(text || '').trim();
    let dueDate = null;
    let rush = false;
    let label = '';

    if (/\b(?:for\s+)?today\b/i.test(cleaned)) {
      dueDate = v23DatePlus(0); rush = true; label = 'Today · RUSH';
      cleaned = cleaned.replace(/\b(?:for\s+)?today\b/ig, ' ');
    } else if (/\b(?:for\s+)?tomorrow\b/i.test(cleaned)) {
      dueDate = v23DatePlus(1); label = 'Tomorrow';
      cleaned = cleaned.replace(/\b(?:for\s+)?tomorrow\b/ig, ' ');
    } else {
      const nextWeek = cleaned.match(/\b(?:for\s+)?next\s+week\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
      if (nextWeek) {
        dueDate = v23NextWeekday(V23_WEEKDAYS[nextWeek[1].toLowerCase()], true);
        label = `Next week ${nextWeek[1]}`;
        cleaned = cleaned.replace(nextWeek[0], ' ');
      } else {
        const nextDay = cleaned.match(/\b(?:for\s+)?next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
        if (nextDay) {
          dueDate = v23NextWeekday(V23_WEEKDAYS[nextDay[1].toLowerCase()], false);
          label = `Next ${nextDay[1]}`;
          cleaned = cleaned.replace(nextDay[0], ' ');
        }
      }
    }
    return { cleaned: cleaned.replace(/\s+/g, ' ').trim(), dueDate, rush, label };
  }

  function v23EnsureTypedState() {
    if (typeof counterDraft === 'undefined' || !counterDraft) return;
    if (!Number.isFinite(counterDraft.v23TypedTicketSeq)) counterDraft.v23TypedTicketSeq = 1;
    if (!counterDraft.v23TypedGroup) counterDraft.v23TypedGroup = `typed-${counterDraft.v23TypedTicketSeq}`;
    if (!Array.isArray(counterDraft.v23TypedHistory)) counterDraft.v23TypedHistory = [];
  }
  function v23AdvanceTicket() {
    v23EnsureTypedState();
    counterDraft.v23TypedTicketSeq += 1;
    counterDraft.v23TypedGroup = `typed-${counterDraft.v23TypedTicketSeq}`;
    return counterDraft.v23TypedGroup;
  }
  function v23GroupKey(service, group) { return `${service}::${group}`; }

  function v23ParseSegment(text, group, warnings, tags) {
    const date = v23NaturalDate(text);
    const parseText = v10NormalizeVoice(date.cleaned);
    if (!parseText) return { items:[], date };
    const items = v14ParseVoiceSegment(parseText, 0, 1, warnings, tags);
    items.forEach(item => { item.ticketGroup = group; item.intakeSource = 'typed-ai'; });
    return { items, date };
  }

  function v23ApplyDate(items, date) {
    if (!date.dueDate) return;
    items.forEach(item => {
      const service = v8ServiceForItem(item);
      const key = v23GroupKey(service, item.ticketGroup || counterDraft.v23TypedGroup);
      counterDraft.serviceDueDates[key] = date.dueDate;
      const rushGroups = new Set(counterDraft.rushGroups || []);
      if (date.rush) rushGroups.add(key); else rushGroups.delete(key);
      counterDraft.rushGroups = [...rushGroups];
    });
  }

  window.v23TypedIntakeSubmit = function v23TypedIntakeSubmit() {
    const input = document.getElementById('v23-ai-entry');
    let raw = String(input?.value || '').trim();
    if (!raw) return;
    v23EnsureTypedState();

    // A standalone "separate ticket" advances the ticket boundary without adding garments.
    if (/^(?:on\s+(?:a\s+)?)?separate\s+ticket[.!,:;\s]*$/i.test(raw)) {
      v23AdvanceTicket();
      counterDraft.v23TypedHistory.unshift({ text:'Separate ticket', group:counterDraft.v23TypedGroup, at:v8NowISO() });
      if (input) input.value = '';
      toast('New separate ticket started — type the next garments', true, 'checkcircle');
      renderPosContent();
      return;
    }

    // A line may contain one or more explicit ticket boundaries.
    const pieces = raw.split(/\b(?:on\s+(?:a\s+)?)?separate\s+ticket\b/i);
    const beginsSeparate = /^\s*(?:on\s+(?:a\s+)?)?separate\s+ticket\b/i.test(raw);
    let group = counterDraft.v23TypedGroup;
    const warnings = [], tags = [], added = [];
    if (beginsSeparate) group = v23AdvanceTicket();

    pieces.forEach((piece, index) => {
      if (index > 0 && !(beginsSeparate && index === 1)) group = v23AdvanceTicket();
      const text = piece.replace(/^[,;:\s]+|[,;:\s]+$/g, '');
      if (!text) return;
      const parsed = v23ParseSegment(text, group, warnings, tags);
      if (!parsed.items.length) {
        warnings.push(`Could not identify an item in “${text}”.`);
        return;
      }
      parsed.items.forEach(item => { v9AddOrMergeLine(item); added.push(item); });
      v23ApplyDate(parsed.items, parsed.date);
      counterDraft.v23TypedHistory.unshift({ text, group, dueDate:parsed.date.dueDate, rush:parsed.date.rush, at:v8NowISO() });
    });

    tags.forEach(tag => { if (!counterDraft.tags.includes(tag)) counterDraft.tags.push(tag); });
    counterDraft.v23TypedGroup = group;
    counterDraft.v23TypedHistory = counterDraft.v23TypedHistory.slice(0, 12);

    if (!added.length) {
      toast(warnings[0] || 'I could not identify a garment or service.', false, 'alerttriangle');
      return;
    }

    const groups = v8DraftGroups();
    groups.forEach(g => counterDraft.serviceDueDates[g.key] ||= v8DefaultDue(g.service));
    counterDraft.serviceMode = groups[0]?.service || counterDraft.serviceMode || 'dryclean';
    counterDraft.aiTranscript = '';
    counterDraft.aiInterpretation = {
      summary: `${added.reduce((sum, item) => sum + Number(item.qty || 0), 0)} item${added.length === 1 ? '' : 's'} added · ticket ${String(group).replace('typed-', '')}`,
      lines: added.map(v10VoiceItemLabel), warnings, at:v8NowISO()
    };
    if (input) input.value = '';
    toast(`Added to ticket ${String(group).replace('typed-', '')}. Press Enter again to keep adding.`, true, 'sparkle');
    renderPosContent();
    requestAnimationFrame(() => document.getElementById('v23-ai-entry')?.focus());
  };

  window.v23AiEntryKeydown = function v23AiEntryKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      v23TypedIntakeSubmit();
    }
  };

  // Redesign the existing AI card so voice and keyboard share the same intake workflow.
  window.v14SimpleAiCard = function v23SimpleAiCard(content) {
    if (content.querySelector?.('#v14-simple-ai')) return;
    const firstCard = content.querySelector?.('.v13-scan-card');
    if (!firstCard) return;
    v23EnsureTypedState();
    const card = document.createElement('div');
    card.id = 'v14-simple-ai';
    card.className = 'v13-scan-card v23-ai-card';
    card.style.textAlign = 'left';
    card.innerHTML = `
      <div class="v8-ai-head v23-ai-head">
        <div><h3 style="margin:0">${icon('sparkle',18)} AI Intake · Voice or Type</h3><div class="v23-ticket-chip">Typing into Ticket ${esc(String(counterDraft.v23TypedTicketSeq || 1))}</div></div>
        <button type="button" id="v3-mic-btn" class="v3-mic-btn ${counterDraft.aiListening?'listening':''}" onclick="posToggleAiVoice()" ${posVoiceSupported()?'':'disabled'}>${icon('mic',19)}</button>
      </div>
      <div class="v2-note" id="v3-mic-status">Type one line and press Enter. Each Enter stays on the same ticket. Type “separate ticket” to start the next ticket. Date phrases like “today,” “tomorrow,” and “next week Thursday” are automatic.</div>
      <textarea id="v23-ai-entry" rows="2" onkeydown="v23AiEntryKeydown(event)" placeholder="3 white blouses · Enter\n2 green jackets · Enter\nseparate ticket 3 shirt on hanger no starch · Enter"></textarea>
      <div class="v23-ai-actions"><button class="v13-giant-btn primary sm" onclick="v23TypedIntakeSubmit()">${icon('plus',16)} Add Typed Line</button><button class="btn btn-secondary" onclick="v3VoiceParse()">${icon('sparkle',16)} Interpret Voice Transcript</button></div>
      <textarea id="v3-ai-transcript" rows="2" oninput="counterDraft.aiTranscript=this.value" placeholder="Voice transcript appears here…">${esc(counterDraft.aiTranscript||'')}</textarea>
      ${v10AiReviewHTML()}`;
    firstCard.insertAdjacentElement('afterend', card);
  };

  // Natural-date support for the existing full voice-transcript interpretation too.
  const v23BaseVoiceParse = window.v3VoiceParse;
  window.v3VoiceParse = function v23VoiceParse() {
    const field = document.getElementById('v3-ai-transcript');
    const raw = String(field?.value || counterDraft.aiTranscript || '').trim();
    if (!raw) return toast('Dictate or type the drop-off first', false, 'alerttriangle');
    const result = v23BaseVoiceParse();
    // Apply one date phrase to all newly interpreted groups when present.
    const date = v23NaturalDate(raw);
    if (date.dueDate) {
      v8DraftGroups().forEach(group => {
        counterDraft.serviceDueDates[group.key] = date.dueDate;
        const rushGroups = new Set(counterDraft.rushGroups || []);
        if (date.rush) rushGroups.add(group.key); else rushGroups.delete(group.key);
        counterDraft.rushGroups = [...rushGroups];
      });
      renderPosContent();
    }
    return result;
  };

  /* ------------------------- ONE PHYSICAL TICKET PER PRINT JOB ------------------------- */
  let v23PrintQueue = [];
  let v23Printing = false;
  let v23AfterPrintHandler = null;

  function v23RecordPrinted(order, label) {
    v8AddActivity(order, 'print', `${label || 'Ticket'} printed`, { printer:'Star TSP100IV / browser print', mode:'one-ticket-job' });
    recordSync(`Ticket printed one-at-a-time · #${order.ticket || order.id} · ${order.barcode}`);
  }
  function v23FinishPrintQueue() {
    if (v23AfterPrintHandler) window.removeEventListener('afterprint', v23AfterPrintHandler);
    v23AfterPrintHandler = null;
    v23Printing = false;
    v23PrintQueue = [];
    if (typeof v8FinishReceiptPrint === 'function') v8FinishReceiptPrint();
    toast('Ticket printing complete', true, 'printer');
  }
  function v23PrintNext() {
    if (!v23PrintQueue.length) return v23FinishPrintQueue();
    const job = v23PrintQueue.shift();
    const area = document.getElementById('print-area');
    if (!area) return v23FinishPrintQueue();
    area.innerHTML = receiptTicketHTML(job.order); // exactly ONE ticket in DOM for this print job
    document.documentElement.classList.add('v8-receipt-printing');
    v23AfterPrintHandler = () => {
      window.removeEventListener('afterprint', v23AfterPrintHandler);
      v23AfterPrintHandler = null;
      // Give Star/Chrome a moment to close the previous job before loading the next ticket.
      setTimeout(v23PrintNext, 260);
    };
    window.addEventListener('afterprint', v23AfterPrintHandler, { once:true });
    setTimeout(() => requestAnimationFrame(() => window.print()), 90);
  }

  window.v8PrintOrders = function v23PrintOrders(orders, label) {
    const clean = (orders || []).filter(Boolean);
    if (!clean.length) return;
    if (v23Printing) return toast('Finish the current print queue first', false, 'printer');
    clean.forEach(order => v23RecordPrinted(order, label));
    saveState();
    closePosModal();
    v23PrintQueue = clean.map(order => ({ order, label }));
    v23Printing = true;
    toast(`${clean.length} ticket${clean.length===1?'':'s'} queued — each prints as its own ticket`, true, 'printer');
    v23PrintNext();
  };
  window.v8PrintCreatedBatch = function v23PrintCreatedBatch(batchId) {
    const orders = state.orders.filter(o => o.intakeBatchId === batchId).sort((a,b) => Number(a.ticket) - Number(b.ticket));
    v8PrintOrders(orders, 'Intake ticket');
  };
  window.posDoPrint = function v23DoPrint(orderId) {
    const order = state.orders.find(x => x.id === orderId);
    if (order) v8PrintOrders([order], 'Ticket');
  };
  // One click on Print now prints directly; no second POS preview/confirmation button.
  window.posPrintReceipt = function v23PrintReceipt(orderId) { posDoPrint(orderId); };
  window.v5PrintMasterOrder = function v23PrintMasterOrder(orderId) {
    const order = state.orders.find(x => x.id === orderId);
    if (!order) return;
    const batch = order.intakeBatchId ? state.orders.filter(x => x.intakeBatchId === order.intakeBatchId) : [order];
    v8PrintOrders(batch.sort((a,b)=>Number(a.ticket)-Number(b.ticket)), 'Service ticket');
  };

  // Improve the post-intake modal wording without duplicating the entire ticket-creation function.
  const v23BaseCompleteDropOff = window.posCompleteDropOff;
  window.posCompleteDropOff = function v23CompleteDropOff() {
    const result = v23BaseCompleteDropOff.apply(this, arguments);
    requestAnimationFrame(() => {
      const modal = document.getElementById('pos-modal');
      const button = modal?.querySelector('button[onclick*="v8PrintCreatedBatch"]');
      if (button) button.innerHTML = `${icon('printer',16)} Print Tickets One at a Time`;
    });
    return result;
  };

  window.V23_BUILD = '23.0.0';
})();

/* ------------------------- V23 RECEIPT HERO + SILENT-PRINT READY ------------------------- */
(function () {
  'use strict';

  // Preserve the production receipt introduced in V17, then enhance its hero area.
  const v23ProductionReceipt = window.receiptTicketHTML || (typeof receiptTicketHTML === 'function' ? receiptTicketHTML : null);

  function v23ReceiptAddress(order) {
    try { return typeof v8AddressForOrder === 'function' ? v8AddressForOrder(order) : null; }
    catch (_error) { return null; }
  }
  function v23ReceiptCustomer(order) {
    try { return order?.customerId && typeof customerById === 'function' ? customerById(order.customerId) : null; }
    catch (_error) { return null; }
  }
  function v23ReceiptDelivery(order, customer) {
    try {
      if (typeof v17EffectiveDelivery === 'function') return !!v17EffectiveDelivery(order, customer);
    } catch (_error) {}
    return order?.fulfillment === 'delivery' || order?.channel === 'delivery';
  }
  function v23UnitValue(address) {
    return String(address?.apartment || address?.unit || address?.apt || '')
      .replace(/^(?:apt\.?|apartment|unit|#)\s*/i, '')
      .replace(/\s*\*+\s*$/, '')
      .trim();
  }

  if (v23ProductionReceipt) {
    window.receiptTicketHTML = function v23ReceiptTicketHTML(order) {
      let html = v23ProductionReceipt(order);
      const customer = v23ReceiptCustomer(order);
      const address = v23ReceiptAddress(order);
      const isDelivery = v23ReceiptDelivery(order, customer);
      const unit = v23UnitValue(address);
      const account = String(customer?.customerNumber || '').trim();

      // V17 had a top APT/DELIVERY marker. V23 replaces it with a much larger centered delivery hero.
      html = html.replace(/<div class="v17-top-unit">[\s\S]*?<\/div>/, '');
      const hero = isDelivery
        ? (unit
          ? `<div class="v23-delivery-unit-label">DELIVERY · APARTMENT</div><div class="v23-delivery-unit">${esc(unit.toUpperCase())}</div>`
          : `<div class="v23-delivery-unit-label">DELIVERY</div>`)
        : '';
      html = html.replace('<div class="v11-store-name">', `${hero}<div class="v11-store-name">`);

      // Ticket number becomes a second high-visibility centered hero and account number is explicit.
      html = html.replace(
        /<div class="v11-ticket-number">([\s\S]*?)<\/div>/,
        (_match, ticket) => `<div class="v23-ticket-label">TICKET</div><div class="v11-ticket-number v23-ticket-number">${ticket}</div>${account ? `<div class="v23-account-number"><span>ACCOUNT</span> ${esc(account)}</div>` : '<div class="v23-account-number"><span>ACCOUNT</span> WALK-IN</div>'}`
      );
      return html;
    };
    // Global function declarations can also be referenced by identifier by older modules.
    try { receiptTicketHTML = window.receiptTicketHTML; } catch (_error) {}
  }

  // Separate physical print jobs need enough time for the Star/Windows spooler to close the previous job.
  window.V23_PRINT_JOB_DELAY_MS = 2500;

  // Replaces the initial queue function with a 2.5 second inter-ticket pause.
  // With Chrome/Edge kiosk printing or a Star/local print bridge, window.print() is silent.
  // Without that workstation configuration, the browser must still show its system print dialog.
  let queue = [];
  let active = false;
  let afterHandler = null;

  function finish() {
    if (afterHandler) window.removeEventListener('afterprint', afterHandler);
    afterHandler = null;
    queue = [];
    active = false;
    if (typeof v8FinishReceiptPrint === 'function') v8FinishReceiptPrint();
    toast('Ticket printing complete', true, 'printer');
  }
  function next() {
    if (!queue.length) return finish();
    const job = queue.shift();
    const area = document.getElementById('print-area');
    if (!area) return finish();
    area.innerHTML = window.receiptTicketHTML(job.order); // ONE physical ticket only.
    document.documentElement.classList.add('v8-receipt-printing');
    afterHandler = () => {
      window.removeEventListener('afterprint', afterHandler);
      afterHandler = null;
      setTimeout(next, window.V23_PRINT_JOB_DELAY_MS);
    };
    window.addEventListener('afterprint', afterHandler, { once:true });
    setTimeout(() => requestAnimationFrame(() => window.print()), 90);
  }

  window.v8PrintOrders = function v23PrintOrdersWithSpoolerDelay(orders, label) {
    const clean = (orders || []).filter(Boolean);
    if (!clean.length) return;
    if (active) return toast('Finish the current print queue first', false, 'printer');
    clean.forEach(order => {
      try {
        if (typeof v8AddActivity === 'function') v8AddActivity(order, 'print', `${label || 'Ticket'} printed`, { printer:'Star TSP100IV', mode:'one-ticket-job', delayMs:window.V23_PRINT_JOB_DELAY_MS });
        if (typeof recordSync === 'function') recordSync(`Ticket printed separately · #${order.ticket || order.id}`);
      } catch (_error) {}
    });
    if (typeof saveState === 'function') saveState();
    if (typeof closePosModal === 'function') closePosModal();
    queue = clean.map(order => ({ order, label }));
    active = true;
    toast(`${clean.length} ticket${clean.length === 1 ? '' : 's'} queued · separate print jobs`, true, 'printer');
    next();
  };
  window.v8PrintCreatedBatch = function v23PrintCreatedBatchWithDelay(batchId) {
    const orders = state.orders.filter(o => o.intakeBatchId === batchId).sort((a,b) => Number(a.ticket) - Number(b.ticket));
    window.v8PrintOrders(orders, 'Intake ticket');
  };
  window.posDoPrint = function v23DirectPrint(orderId) {
    const order = state.orders.find(x => x.id === orderId);
    if (order) window.v8PrintOrders([order], 'Ticket');
  };
  window.posPrintReceipt = function v23DirectPrintNoPosPopup(orderId) { window.posDoPrint(orderId); };
  window.v5PrintMasterOrder = function v23PrintMasterOrderWithDelay(orderId) {
    const order = state.orders.find(x => x.id === orderId);
    if (!order) return;
    const batch = order.intakeBatchId ? state.orders.filter(x => x.intakeBatchId === order.intakeBatchId) : [order];
    window.v8PrintOrders(batch.sort((a,b)=>Number(a.ticket)-Number(b.ticket)), 'Service ticket');
  };

  window.V23_BUILD = '23.1.0';
})();
