/* Hattan Ops Suite V29.5 — Customer Master Identity Overlay */
(function(){'use strict';
const fmt=s=>String(s||'').trim();
function initials(name){const p=fmt(name).replace(/,/g,' ').split(/\s+/).filter(Boolean);return ((p[0]?.[0]||'C')+(p[1]?.[0]||'B')).toUpperCase()}
function install(rows){
 if(typeof state==='undefined'||!Array.isArray(state.customers)){setTimeout(()=>install(rows),100);return}
 const byLegacy=new Map(state.customers.filter(c=>c.legacyCustomerId!=null).map(c=>[String(c.legacyCustomerId),c]));
 const byNum=new Map(state.customers.filter(c=>c.customerNumber).map(c=>[String(c.customerNumber),c]));
 let applied=0,aliases=0;
 rows.forEach(r=>{const c=byLegacy.get(String(r.legacyId))||byNum.get(String(r.customerNumber));if(!c)return;
   const placeholder=!c.name||/^Customer\s*#/i.test(c.name)||/^Unnamed customer$/i.test(c.name);
   if(placeholder&&r.name){c.name=fmt(r.name);c.initials=initials(r.name);applied++}
   c.searchAliases=Array.from(new Set([...(c.searchAliases||[]),r.name,String(r.customerNumber)].filter(Boolean)));aliases++;
   c.legacyIdentitySource=r.evidence||'customer-list';c.legacyIdentityPage=r.sourcePage||null;
 });
 window.HATTAN_V295_CUSTOMER_MASTER={mapped:rows.length,applied,aliases};
 if(state.session?.loggedIn&&state.posNav==='customers'&&typeof renderPosContent==='function')renderPosContent();
}
(function bootIdentityOverlay(){
 const bundled=window.HATTAN_V2952_IDENTITIES;
 if(Array.isArray(bundled)){install(bundled);return;}
 fetch('legacy-v294/customer-v295-identities.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('V29.5 customer map '+r.status);return r.json()}).then(install).catch(e=>{window.HATTAN_V295_IDENTITY_ERROR=String(e&&e.message||e);console.error('V29.5 customer master:',e)});
})();
document.addEventListener('DOMContentLoaded',()=>{document.documentElement.setAttribute('data-hattan-release','V29.5');window.HATTAN_RELEASE='V29.5';});
})();