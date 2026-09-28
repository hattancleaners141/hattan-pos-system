/* Hattan Ops Suite V29.5.2 — deterministic customer directory bootstrap */
(function(){'use strict';
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const norm=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const digits=s=>String(s||'').replace(/\D/g,'');
const REPORT_START=Date.parse('2023-09-01T00:00:00');
window.v2951DirectoryMode=window.v2951DirectoryMode||'report';
function act(c){return Date.parse(c.legacyLastActivity||'')||0}
function joined(c){return Date.parse(c.legacyJoinedDate||c.joinedAt||c.createdAt||'')||0}
function blob(c){const a=(c.addresses||[]).map(x=>`${x.line1||''} ${x.line2||''} ${x.city||''} ${x.state||''} ${x.zip||''}`).join(' ');return `${c.name||''} ${c.phone||''} ${c.email||''} ${c.customerNumber||''} ${c.legacyCustomerId||''} ${a} ${(c.searchAliases||[]).join(' ')}`}
function loaded(){return !!(window.HATTAN_V294_META && window.state && Array.isArray(window.state.customers) && window.state.customers.some(c=>String(c.id||'').startsWith('cb_')))}
function loadingCard(content){if(!content)return;content.innerHTML='<div class="pos-card" style="padding:28px"><h3>Loading customer directory…</h3><div class="helper-text">Bundled CleanBase customer master is initializing locally.</div></div>'}
function errorCard(content,msg){if(!content)return;content.innerHTML=`<div class="pos-card" style="padding:28px;border:2px solid #b42318"><h3>Customer directory did not initialize</h3><div class="helper-text" style="margin:8px 0 14px">${E(msg||'Unknown loader error')}</div><button class="btn btn-primary" onclick="location.reload()">Reload POS</button></div>`}
window.v2951SetMode=v=>{window.v2951DirectoryMode=v;window.renderPosCustomers(document.getElementById('pos-content'))};
window.renderPosCustomers=function(content){
 if(!loaded()){loadingCard(content);return}
 const st=window.state,q=String(st.posCustSearch||'').trim(),nq=norm(q),qd=digits(q);let list=[...(st.customers||[])];
 if(window.v2951DirectoryMode==='report') list=list.filter(c=>act(c)>=REPORT_START);
 if(q) list=list.filter(c=>norm(blob(c)).includes(nq)||(qd.length>=3&&digits(blob(c)).includes(qd)));
 const sort=window.v294Sort||'recent';
 if(sort==='joined')list.sort((a,b)=>joined(b)-joined(a)||act(b)-act(a));else if(sort==='name')list.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));else list.sort((a,b)=>act(b)-act(a)||joined(b)-joined(a));
 const total=list.length,mapped=list.filter(c=>c.name&&!/^Customer\s*#/i.test(c.name)&&!/^Unnamed customer$/i.test(c.name)).length;
 content.innerHTML=`<div class="v292-customers v293-customers"><div class="pos-card" style="margin-bottom:12px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="pos-search" style="flex:1;min-width:320px"><span class="search-ic">⌕</span><input autofocus placeholder="Search name, phone, customer #, address…" value="${E(st.posCustSearch||'')}" oninput="posCustDirSearch(this.value)" /></div><button class="btn btn-secondary" onclick="posOpenNewCustomer()">+ New Customer</button></div><div class="v293-filter-row"><strong>Directory:</strong><button class="btn btn-sm ${window.v2951DirectoryMode==='report'?'btn-primary':'btn-secondary'}" onclick="v2951SetMode('report')">09/01/23–snapshot</button><button class="btn btn-sm ${window.v2951DirectoryMode==='all'?'btn-primary':'btn-secondary'}" onclick="v2951SetMode('all')">All historical</button><span class="v293-spacer"></span><strong>${window.v2951DirectoryMode==='report'?'CleanBase activity since 09/01/23':'CleanBase historical master'}</strong></div></div><div class="pos-table-wrap v292-table v293-table"><table class="pos-table"><thead><tr><th>Customer</th><th>Phone</th><th>Last Activity</th><th>Joined</th><th>Tickets</th><th>Legacy Spend</th></tr></thead><tbody>${list.slice(0,5000).map(c=>`<tr class="clickable" onclick="v294OpenCustomer('${E(c.id)}')"><td><strong>${E(c.name||'Unnamed customer')}</strong><div class="row-sub">Customer ${E(c.customerNumber||c.legacyCustomerId||'—')}</div></td><td>${E(c.phone||'—')}</td><td>${act(c)?new Date(act(c)).toLocaleString():'—'}</td><td>${joined(c)?new Date(joined(c)).toLocaleDateString():E(c.memberSince||'—')}</td><td>${Number(c.legacyTicketCount||0).toLocaleString()}</td><td>${typeof money==='function'?money(c.legacyLifetimeSpend||0):('$'+Number(c.legacyLifetimeSpend||0).toFixed(2))}</td></tr>`).join('')||'<tr><td colspan="6">No customers match.</td></tr>'}</tbody></table></div><div class="helper-text" style="margin-top:8px">${total.toLocaleString()} loaded records in this view · ${mapped.toLocaleString()} named/identified · V29.5.2 bundled loader</div></div>`;
};
let tries=0;const timer=setInterval(()=>{tries++;const st=window.state;if(loaded()){clearInterval(timer);if(st?.session?.loggedIn&&st.posNav==='customers')window.renderPosCustomers(document.getElementById('pos-content'));return}if(tries>=100){clearInterval(timer);window.HATTAN_V2952_LOAD_ERROR=window.HATTAN_V294_LOAD_ERROR||'Customer master did not initialize within 10 seconds.';if(st?.posNav==='customers')errorCard(document.getElementById('pos-content'),window.HATTAN_V2952_LOAD_ERROR)}},100);
window.HATTAN_RELEASE='V29.5.2';document.documentElement.setAttribute('data-hattan-release','V29.5.2');
})();
