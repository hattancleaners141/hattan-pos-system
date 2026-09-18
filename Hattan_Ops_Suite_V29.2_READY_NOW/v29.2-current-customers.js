/* Hattan Ops Suite V29.2 — safe current-customer overlay. No card data. */
(function(){'use strict';
const esc2=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function fmtPhone(v){const d=String(v||'').replace(/\D/g,'');return d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:v||''}
function nativeLast(c){let best=0;(window.state?.orders||[]).forEach(o=>{if(o.customerId===c.id){const t=Date.parse(o.createdAt||o.dateLabel||'');if(t>best)best=t}});return best}
function recentTime(c){return Math.max(Date.parse(c.legacyLastActivity||'')||0,nativeLast(c));}
function install(rows){
  if(!window.state||!Array.isArray(state.customers)) return;
  const existingByLegacy=new Map(state.customers.filter(c=>c.legacyCustomerId!=null).map(c=>[String(c.legacyCustomerId),c]));
  const existingByNum=new Map(state.customers.filter(c=>c.customerNumber).map(c=>[String(c.customerNumber),c]));
  rows.forEach(r=>{
    let c=existingByLegacy.get(String(r.legacyId))||existingByNum.get(String(r.customerNumber));
    if(c){c.legacyCustomerId=r.legacyId;c.legacyLastActivity=r.lastActivity;if(!c.phone&&r.phone)c.phone=fmtPhone(r.phone);return;}
    const name=`Customer #${r.customerNumber}`;
    state.customers.push({id:`cb_${r.legacyId}`,legacyCustomerId:r.legacyId,customerNumber:String(r.customerNumber),name,initials:'CB',phone:fmtPhone(r.phone),email:'',memberSince:'CleanBase',points:0,storeCredit:0,preferredChannel:'pickup',addresses:r.zip?[{id:`cb_addr_${r.legacyId}`,line1:'',line2:'',city:'New York',state:'NY',zip:r.zip}]:[],paymentMethods:[],garmentPrefs:{starch:'none',fold:'hang',fragranceFree:false,notes:r.note||''},legacyLastActivity:r.lastActivity,legacyCurrent:true});
  });
  window.HATTAN_CURRENT_CUSTOMERS_LOADED=rows.length;
  if(typeof renderPosContent==='function'&&state.session?.loggedIn&&state.posNav==='customers')renderPosContent();
}
function recentCards(){
  const arr=[...(state.customers||[])].filter(c=>recentTime(c)>0).sort((a,b)=>recentTime(b)-recentTime(a)).slice(0,12);
  if(!arr.length)return '';
  return `<div class="pos-card v292-recent"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0">Most Recent Customers</h3><span class="row-sub">Current CleanBase activity + V29 activity</span></div><div class="v292-recent-grid">${arr.map(c=>`<button onclick="v7OpenCustomerProfile('${c.id}')"><strong>${esc2(c.name)}</strong><span>${esc2(c.phone||('Customer '+(c.customerNumber||'')))}</span><small>${new Date(recentTime(c)).toLocaleString()}</small></button>`).join('')}</div></div>`;
}
const old=window.renderPosCustomers;
window.renderPosCustomers=function(content){
  const search=(state.posCustSearch||'').trim().toLowerCase();let list=state.customers||[];
  if(search)list=list.filter(c=>(typeof v6CustomerSearchBlob==='function'?v6CustomerSearchBlob(c):`${c.name} ${c.phone} ${c.customerNumber}`).toLowerCase().includes(search));
  else list=[...list].sort((a,b)=>recentTime(b)-recentTime(a));
  content.innerHTML=`<div class="v292-customers">${!search?recentCards():''}<div class="filter-tabs"><div class="pos-search" style="margin-left:0;max-width:520px"><span class="search-ic">${typeof icon==='function'?icon('search',15):'⌕'}</span><input placeholder="Search customer #, name or phone…" value="${esc2(state.posCustSearch||'')}" oninput="posCustDirSearch(this.value)" /></div><button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="posOpenNewCustomer()">+ New Customer</button></div><div class="pos-table-wrap v292-table"><table class="pos-table"><thead><tr><th>Customer</th><th>Phone</th><th>Last Activity</th><th>Orders</th><th>Member Since</th></tr></thead><tbody>${list.slice(0,search?500:1500).map(c=>{const orders=(state.orders||[]).filter(o=>o.customerId===c.id);const rt=recentTime(c);return `<tr class="clickable" onclick="v7OpenCustomerProfile('${c.id}')"><td><strong>${esc2(c.name)}</strong><div class="row-sub">Customer ${esc2(c.customerNumber||'—')}</div></td><td class="muted">${esc2(c.phone||'—')}</td><td>${rt?new Date(rt).toLocaleString():'—'}</td><td>${orders.length}</td><td class="muted">${esc2(c.memberSince||'—')}</td></tr>`}).join('')}</tbody></table></div><div class="helper-text" style="margin-top:8px">${list.length.toLocaleString()} customers available${list.length>1500&&!search?' · showing 1,500 most recent — search finds the current imported set':''}. Current overlay contains no full card numbers or CVV.</div></div>`;
};
fetch('current-customers.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('customer data '+r.status);return r.json()}).then(install).catch(e=>console.error('V29.2 current customers:',e));
})();
