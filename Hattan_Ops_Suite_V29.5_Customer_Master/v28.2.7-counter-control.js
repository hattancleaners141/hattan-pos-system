/* Hattan Ops Suite V28.2.7 — Counter Control Center */
(function(){
  state.viewedCustomers = state.viewedCustomers || [];
  state.heldTickets = state.heldTickets || [];
  state.counterCustomerAction = state.counterCustomerAction || null;

  const oldSave = saveState;
  saveState = function(){
    try {
      const lightOrders = state.orders.map(o => ({ ...o, garmentPhotos: stripPhotos(o.garmentPhotos), deliveryPhotos: stripPhotos(o.deliveryPhotos) }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        customers:state.customers,staff:state.staff,orders:lightOrders,session:state.session,driverSession:state.driverSession,
        clockLog:state.clockLog,pendingSync:state.pendingSync,nextTicket:state.nextTicket,campaigns:state.campaigns,automatedTexts:state.automatedTexts,
        rackSettings:state.rackSettings,printSettings:state.printSettings,recentCustomerSearches:state.recentCustomerSearches,customerMemos:state.customerMemos,
        interfaceSettings:state.interfaceSettings,garmentCatalog:state.garmentCatalog,materials:state.materials,nextConveyorNumber:state.nextConveyorNumber,
        viewedCustomers:state.viewedCustomers,heldTickets:state.heldTickets
      }));
    } catch(e){ try{ oldSave(); }catch(_){} }
  };
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    if(saved.viewedCustomers) state.viewedCustomers=saved.viewedCustomers;
    if(saved.heldTickets) state.heldTickets=saved.heldTickets;
  }catch(e){}

  if(!POS_NAV_ITEMS.some(n=>n.id==='viewed')) POS_NAV_ITEMS.splice(5,0,{id:'viewed',label:'Viewed Customers',icon:'users'});
  POS_TITLES.viewed=['Viewed Customers','Timestamped customer lookup trail for backtracking'];

  const baseRender=renderPosContent;
  renderPosContent=function(){
    if(state.posNav==='viewed'){
      const t=document.getElementById('pos-title'); if(t)t.textContent='Viewed Customers';
      const s=document.getElementById('pos-sub'); if(s)s.textContent='Timestamped customer lookup trail for backtracking';
      document.querySelectorAll('.pos-nav button').forEach((b,i)=>b.classList.toggle('active',POS_NAV_ITEMS[i]?.id==='viewed'));
      return renderViewedCustomers(document.getElementById('pos-content'));
    }
    return baseRender();
  };

  function rememberViewed(id,source){
    const c=customerById(id); if(!c)return;
    state.viewedCustomers.unshift({id:uid('vw_'),customerId:id,at:new Date().toISOString(),staffId:state.session.staffId,register:state.session.register,source:source||'Counter'});
    state.viewedCustomers=state.viewedCustomers.slice(0,500);
    saveState();
  }
  window.rememberViewed=rememberViewed;

  window.renderViewedCustomers=function(content){
    if(!content)return;
    content.innerHTML=`<div class="pos-card v287-viewed"><div class="v287-head"><h3>Recent customer lookups</h3><button class="btn btn-ghost btn-sm" onclick="state.viewedCustomers=[];saveState();renderPosContent()">Clear History</button></div>
      <div class="v287-table">${state.viewedCustomers.length?state.viewedCustomers.map(v=>{const c=customerById(v.customerId);if(!c)return'';const st=staffById(v.staffId);const dt=new Date(v.at);return `<div class="v287-view-row" tabindex="0" onclick="v287OpenViewed('${c.id}')" onkeydown="if(event.key==='Enter')v287OpenViewed('${c.id}')"><div><strong>${esc(c.name)}</strong><span>${c.phone} · ${c.customerNumber||'No customer #'}</span></div><div><strong>${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</strong><span>${st?st.name:'Staff'} · ${esc(v.source||'Lookup')}</span></div></div>`}).join(''):`<div class="table-empty">No customer lookups recorded yet.</div>`}</div></div>`;
  };
  window.v287OpenViewed=function(id){ rememberViewed(id,'Viewed Customers'); state.posNav='customers'; v7OpenCustomerProfile(id); };

  const basePick=posPickCustomer;
  posPickCustomer=function(id){
    if(!counterDraft) counterDraft=freshCounterDraft();
    counterDraft.customerId=id; posCustomerSearch=''; state.counterCustomerAction='menu'; rememberViewed(id,'Counter lookup'); renderPosContent();
  };
  posClearCustomer=function(){ if(counterDraft)counterDraft.customerId=null; state.counterCustomerAction=null; renderPosContent(); };
  const baseSearch=posCustomerSearchInput;
  posCustomerSearchInput=function(v){ posCustomerSearch=v; renderPosContent(); setTimeout(()=>{const el=document.querySelector('.customer-search-box input'); if(el){el.onkeydown=e=>{if(e.key==='Enter'){const q=posCustomerSearch.trim().toLowerCase();const c=state.customers.find(c=>c.name.toLowerCase().includes(q)||c.phone.includes(q));if(c)posPickCustomer(c.id);}}}},0); };

  const baseCounter=renderPosCounter;
  renderPosCounter=function(content){
    if(!counterDraft)counterDraft=freshCounterDraft();
    const c=counterDraft.customerId?customerById(counterDraft.customerId):null;
    if(c && state.counterCustomerAction==='menu') return renderCounterActionMenu(content,c);
    baseCounter(content);
    injectHoldControls();
  };

  function renderCounterActionMenu(content,c){
    const open=state.orders.filter(o=>o.customerId===c.id&&!['picked_up','delivered'].includes(o.status));
    content.innerHTML=`<div class="v287-action-shell"><div class="v287-customer-banner"><div><strong>${esc(c.name)}</strong><span>${c.phone} · ${c.customerNumber||''}</span></div><button class="btn btn-ghost btn-sm" onclick="posClearCustomer()">Change Customer</button></div>
      <h2>What are we doing for ${esc(c.name.split(' ')[0])}?</h2><div class="v287-action-grid">
      <button onclick="v287Pickup('${c.id}')"><b>Pick Up</b><span>${open.length?open.length+' active order'+(open.length===1?'':'s'):'View ready / open orders'}</span></button>
      <button onclick="v287Dropoff('${c.id}')"><b>Drop Off</b><span>Start a new cleaning ticket</span></button>
      <button onclick="v287Profile('${c.id}')"><b>View Customer Profile</b><span>History, preferences, credit & notes</span></button>
      </div><div class="v287-secondary"><button class="btn btn-secondary" onclick="v287SchedulePickup('${c.id}')">${icon('truck',15)} Schedule Driver Pickup</button>${state.heldTickets.length?`<button class="btn btn-secondary" onclick="v287ShowHeld()">${icon('clock',15)} Held Tickets (${state.heldTickets.length})</button>`:''}</div></div>`;
  }
  window.v287Dropoff=function(id){state.counterCustomerAction='dropoff';counterDraft.customerId=id;renderPosContent();};
  window.v287Profile=function(id){rememberViewed(id,'Profile');state.posNav='customers';v7OpenCustomerProfile(id);};
  window.v287Pickup=function(id){rememberViewed(id,'Pickup');state.posNav='customers';v7OpenCustomerProfile(id);toast('Open/ready tickets shown on customer profile',true,'box');};

  function injectHoldControls(){
    const card=document.querySelector('.counter-grid .pos-card'); if(!card)return;
    const bar=document.createElement('div');bar.className='v287-holdbar';bar.innerHTML=`<button class="btn btn-secondary btn-sm" onclick="v287HoldTicket()">${icon('clock',14)} Hold Ticket</button>${state.heldTickets.length?`<button class="btn btn-ghost btn-sm" onclick="v287ShowHeld()">Resume Held (${state.heldTickets.length})</button>`:''}`;card.prepend(bar);
  }
  window.v287HoldTicket=function(){
    if(!counterDraft||(!counterDraft.customerId&&!counterDraft.items.length))return toast('Nothing to hold yet',false,'alerttriangle');
    const c=counterDraft.customerId?customerById(counterDraft.customerId):null;
    state.heldTickets.unshift({id:uid('hold_'),heldAt:new Date().toISOString(),staffId:state.session.staffId,label:c?c.name:(counterDraft.guestName||'Guest'),draft:JSON.parse(JSON.stringify(counterDraft))});
    saveState();counterDraft=freshCounterDraft();state.counterCustomerAction=null;posCustomerSearch='';renderPosContent();toast('Ticket held — counter is ready for the next customer',true,'clock');
  };
  window.v287ShowHeld=function(){
    openPosModal(`<h3>Held Tickets</h3><p class="pm-sub">Resume any interrupted drop-off exactly where you left it.</p>${state.heldTickets.length?state.heldTickets.map(h=>`<div class="list-row" onclick="v287ResumeHeld('${h.id}')"><div class="row-icon">${icon('clock',15)}</div><div class="row-body"><div class="row-title">${esc(h.label)}</div><div class="row-sub">Held ${new Date(h.heldAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</div></div><div class="row-trail">${icon('chevronright',15)}</div></div>`).join(''):'<div class="table-empty">No held tickets.</div>'}<button class="btn btn-ghost btn-block" onclick="closePosModal()">Close</button>`);
  };
  window.v287ResumeHeld=function(id){const i=state.heldTickets.findIndex(h=>h.id===id);if(i<0)return;counterDraft=state.heldTickets[i].draft;state.heldTickets.splice(i,1);state.counterCustomerAction='dropoff';saveState();closePosModal();state.posNav='counter';renderPosContent();toast('Held ticket resumed',true,'checkcircle');};

  window.v287SchedulePickup=function(id){
    const c=customerById(id);if(!c)return; const addr=(c.addresses||[])[0];
    openPosModal(`<h3>Schedule Pickup · ${esc(c.name)}</h3><p class="pm-sub">Creates a pickup stop in the Driver App and prints a counter slip.</p><span class="field-label">Pickup date</span><input id="v287-pdate" class="text-input" type="date" style="margin-bottom:12px"><span class="field-label">Pickup window</span><select id="v287-pwindow" class="text-input" style="margin-bottom:12px"><option>9:00 AM – 12:00 PM</option><option>12:00 – 3:00 PM</option><option>3:00 – 6:00 PM</option></select><span class="field-label">Notes for driver</span><input id="v287-pnote" class="text-input" placeholder="Doorman, call on arrival, bags, etc." style="margin-bottom:14px"><button class="btn btn-primary btn-block" onclick="v287ConfirmPickup('${id}')">Schedule + Print Pickup Slip</button><button class="btn btn-ghost btn-block" onclick="closePosModal()">Cancel</button>`);
    const d=document.getElementById('v287-pdate');if(d)d.value=new Date().toISOString().slice(0,10);
  };
  window.v287ConfirmPickup=function(id){
    const c=customerById(id);if(!c)return;const date=document.getElementById('v287-pdate').value;const win=document.getElementById('v287-pwindow').value;const note=document.getElementById('v287-pnote').value;const addr=(c.addresses||[])[0];
    const o={id:'PU-'+String(Date.now()).slice(-6),channel:'delivery',customerId:id,placedLabel:'Scheduled '+date,dateLabel:date,items:'Scheduled customer pickup'+(note?' · '+note:''),services:[],total:0,status:'scheduled',stageIndex:0,address:addr?addr.id:null,window:win,recurring:'none',paid:true,paymentMethod:'none',pointsAwarded:false,garmentPhotos:[],deliveryPhotos:[],assignedDriverId:null,invoiced:false,pickupOnly:true,pickupNotes:note};
    state.orders.unshift(o);recordSync(`Pickup scheduled · ${c.name} · ${date} · ${win}`);saveState();closePosModal();v287PrintPickupSlip(o.id);renderPosContent();toast('Pickup scheduled — now visible in Delivery/Driver workflow',true,'truck');
  };
  window.v287PrintPickupSlip=function(orderId){
    const o=state.orders.find(x=>x.id===orderId);if(!o)return;const c=customerById(o.customerId);const w=window.open('','_blank','width=340,height=500');if(!w)return toast('Popup blocked — pickup is still scheduled',false,'alerttriangle');w.document.write(`<html><body style="font-family:Arial;text-align:center;padding:12px"><h2 style="margin:0">HATTAN CLEANERS</h2><h3>PICKUP REQUEST</h3><div style="font-size:22px;font-weight:bold">${esc(c.name)}</div><p>${esc(c.phone)}</p><hr><div style="font-size:18px;font-weight:bold">${esc(o.dateLabel)}</div><div style="font-size:18px">${esc(o.window)}</div><p>${esc(o.items)}</p><div style="font-size:12px">${esc(o.id)}</div><script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\/script></body></html>`);w.document.close();
  };

  const oldProfile=v7OpenCustomerProfile;
  v7OpenCustomerProfile=function(id){rememberViewed(id,'Customer profile');return oldProfile(id);};
})();
