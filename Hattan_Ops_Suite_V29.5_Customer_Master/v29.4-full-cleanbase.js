/* Hattan Ops Suite V29.4 — CleanBase all customers + 4-year ticket bridge */
(function(){'use strict';
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const digits=s=>String(s||'').replace(/\D/g,'');
const fmtPhone=v=>{const d=digits(v);return d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:(v||'')};
let ready=false,meta=null, legacyLoaded=[];
function joined(c){return Date.parse(c.legacyJoinedDate||c.joinedAt||c.createdAt||'')||0}
function activity(c){return Date.parse(c.legacyLastActivity||'')||0}
function blob(c){const a=(c.addresses||[]).map(x=>`${x.line1||''} ${x.line2||''} ${x.city||''} ${x.state||''} ${x.zip||''}`).join(' ');return `${c.name||''} ${c.phone||''} ${c.email||''} ${c.customerNumber||''} ${c.legacyCustomerId||''} ${a} ${(c.searchAliases||[]).join(' ')}`}
function install(rows){
 if(!window.state||!Array.isArray(state.customers)){setTimeout(()=>install(rows),100);return}
 const byLegacy=new Map(state.customers.filter(c=>c.legacyCustomerId!=null).map(c=>[String(c.legacyCustomerId),c]));
 const byNum=new Map(state.customers.filter(c=>c.customerNumber).map(c=>[String(c.customerNumber),c]));
 rows.forEach(r=>{
   let c=byLegacy.get(String(r.legacyId))||byNum.get(String(r.customerNumber));
   if(!c){c={id:`cb_${r.legacyId}`,name:`Customer #${r.customerNumber}`,initials:'CB',email:'',points:0,storeCredit:0,preferredChannel:'pickup',paymentMethods:[],garmentPrefs:{starch:'none',fold:'hang',fragranceFree:false,notes:''},addresses:[]};state.customers.push(c)}
   c.legacyCustomerId=r.legacyId;c.customerNumber=String(r.customerNumber);c.legacyLastActivity=r.lastActivity||'';c.legacyJoinedDate=r.joined||'';c.legacyTicketCount=r.fourYearTicketCount||0;c.legacyLifetimeSpend=r.fourYearSpend||0;if(r.fourYearLastActivity)c.legacyLastActivity=r.fourYearLastActivity;c.memberSince=r.joined?new Date(r.joined).toLocaleDateString():(c.memberSince||'CleanBase');
   if(!c.phone&&r.phone)c.phone=fmtPhone(r.phone);
   if((!c.addresses||!c.addresses.length)&&r.zip)c.addresses=[{id:`cb_addr_${r.legacyId}`,line1:'',line2:'',city:'',state:r.state||'NY',zip:r.zip}];
   byLegacy.set(String(r.legacyId),c);byNum.set(String(r.customerNumber),c);
 });
 ready=true;window.HATTAN_V294_META=meta; if(state.session?.loggedIn&&state.posNav==='customers'&&typeof renderPosContent==='function')renderPosContent();
}
window.v294Period=window.v294Period||'all';window.v294Sort=window.v294Sort||'recent';
window.v294SetPeriod=v=>{window.v294Period=v;renderPosCustomers(document.getElementById('pos-content'))};
window.v294SetSort=v=>{window.v294Sort=v;renderPosCustomers(document.getElementById('pos-content'))};
window.renderPosCustomers=function(content){
 const q=String(state.posCustSearch||'').trim(),nq=norm(q),qd=digits(q);let list=[...(state.customers||[])];
 if(q)list=list.filter(c=>norm(blob(c)).includes(nq)||(qd.length>=3&&digits(blob(c)).includes(qd)));
 const days={30:30,90:90,180:180,365:365,730:730}[window.v294Period];if(days){const cut=Date.now()-days*864e5;list=list.filter(c=>activity(c)>=cut)}
 if(window.v294Sort==='joined')list.sort((a,b)=>joined(b)-joined(a)||activity(b)-activity(a));else if(window.v294Sort==='name')list.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));else list.sort((a,b)=>activity(b)-activity(a)||joined(b)-joined(a));
 const btn=(v,l)=>`<button class="btn btn-sm ${window.v294Period===v?'btn-primary':'btn-secondary'}" onclick="v294SetPeriod('${v}')">${l}</button>`;
 content.innerHTML=`<div class="v292-customers v293-customers"><div class="pos-card" style="margin-bottom:12px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="pos-search" style="flex:1;min-width:320px"><span class="search-ic">⌕</span><input autofocus placeholder="Search all customers: name, phone, customer #, address…" value="${E(state.posCustSearch||'')}" oninput="posCustDirSearch(this.value)" /></div><button class="btn btn-secondary" onclick="posOpenNewCustomer()">+ New Customer</button></div><div class="v293-filter-row"><strong>Active:</strong>${btn('30','30 days')}${btn('90','90 days')}${btn('180','6 months')}${btn('365','1 year')}${btn('730','2 years')}${btn('all','All')}<span class="v293-spacer"></span><label><strong>Order:</strong> <select onchange="v294SetSort(this.value)"><option value="recent" ${window.v294Sort==='recent'?'selected':''}>Most recent activity</option><option value="joined" ${window.v294Sort==='joined'?'selected':''}>Newest customers</option><option value="name" ${window.v294Sort==='name'?'selected':''}>Name A–Z</option></select></label></div></div><div class="pos-table-wrap v292-table v293-table"><table class="pos-table"><thead><tr><th>Customer</th><th>Phone</th><th>Last Activity</th><th>Joined</th><th>Tickets</th><th>Legacy Spend</th></tr></thead><tbody>${list.slice(0,3000).map(c=>`<tr class="clickable" onclick="v294OpenCustomer('${E(c.id)}')"><td><strong>${E(c.name||'Unnamed customer')}</strong><div class="row-sub">Customer ${E(c.customerNumber||c.legacyCustomerId||'—')}</div></td><td>${E(c.phone||'—')}</td><td>${activity(c)?new Date(activity(c)).toLocaleString():'—'}</td><td>${joined(c)?new Date(joined(c)).toLocaleDateString():E(c.memberSince||'—')}</td><td>${Number(c.legacyTicketCount||0).toLocaleString()}</td><td>${typeof money==='function'?money(c.legacyLifetimeSpend||0):('$'+Number(c.legacyLifetimeSpend||0).toFixed(2))}</td></tr>`).join('')||'<tr><td colspan="6">No customers match.</td></tr>'}</tbody></table></div><div class="helper-text" style="margin-top:8px">${ready?`${(meta?.customers||27533).toLocaleString()} current CleanBase customers loaded · `:'Loading full CleanBase customer master… · '}${list.length.toLocaleString()} matching${list.length>3000?' · showing first 3,000':''}</div></div>`;
};
async function loadTickets(c){
 const cid=Number(c.legacyCustomerId);if(!Number.isFinite(cid))return [];
 const bucket=(cid&15).toString(16);const r=await fetch(`legacy-v294/tickets4y-${bucket}.json`,{cache:'no-store'});if(!r.ok)throw Error('ticket history '+r.status);const all=await r.json();return all.filter(x=>Number(x[0])===cid).map(x=>x[1]);
}
function asOrder(c,t){const its=(t.items||[]).map(i=>`${i.q||1} ${i.d}`).join(', ');return {id:`legacy_${t.w}`,ticket:t.ticket,customerId:c.id,channel:'counter',createdAt:t.c,dueDate:t.due?String(t.due).slice(0,10):'',status:t.done?'picked_up':'ready',stageIndex:0,total:Number(t.total||0),discount:0,surcharge:0,paid:!!t.paid,paymentMethod:t.paid?'legacy payment':'',items:its||`${t.qty||0} item(s)`,rack:'',tagNumber:'',fulfillment:'pickup',legacy:true,legacyItems:t.items||[]};}
window.v294OpenCustomer=async function(id){
 const c=(state.customers||[]).find(x=>x.id===id);if(!c)return;
 try{const ts=await loadTickets(c);state.orders=(state.orders||[]).filter(o=>!o.__v294Loaded);const os=ts.map(t=>Object.assign(asOrder(c,t),{__v294Loaded:true}));state.orders.push(...os);legacyLoaded=os.map(o=>o.id);}catch(e){console.error(e);if(typeof toast==='function')toast('Legacy ticket history could not load',false,'alerttriangle')}
 if(typeof v7OpenCustomerProfile==='function')v7OpenCustomerProfile(id);
};
Promise.all([fetch('legacy-v294/meta.json',{cache:'no-store'}).then(r=>r.json()),fetch('legacy-v294/customers.json',{cache:'no-store'}).then(r=>r.json())]).then(([m,rows])=>{meta=m;install(rows)}).catch(e=>console.error('V29.4 CleanBase load:',e));
})();
