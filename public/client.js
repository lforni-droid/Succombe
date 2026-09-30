(function(){
"use strict";
const {$,esc,addDays,today,eur,num,dayShort,dayLong,parse,STATUS,toast,macroBlock,makeClient}=window.SC;
const CFG=window.SUCCOMBE_CONFIG||{};
const sb=makeClient();
const S={menus:{},selDate:null,cart:{date:null,items:{}},mine:[]};
const LS_CLIENT="succombe-client",LS_TOKENS="succombe-commandes";
const ls={get(k,d){try{return JSON.parse(localStorage.getItem(k))||d;}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};

$("#f-creneau").innerHTML=(CFG.CRENEAUX||[]).map(c=>`<option>${esc(c)}</option>`).join("");

const platsOf=d=>S.menus[d]||[];
const days=()=>Array.from({length:CFG.JOURS_VISIBLES||7},(_,i)=>addDays(today(),i));

async function loadPlats(){
  const ds=days();
  const {data,error}=await sb.from("plats").select("*").gte("jour",ds[0]).lte("jour",ds[ds.length-1]).order("ordre").order("created_at");
  if(error){$("#plats").innerHTML=`<div class="empty"><p>La carte n'a pas pu être chargée.</p><p class="small">Vérifiez votre connexion puis rechargez la page.</p></div>`;return;}
  const m={};(data||[]).forEach(p=>{(m[p.jour]=m[p.jour]||[]).push(p);});
  S.menus=m;render();
}
async function loadMine(){
  const tokens=ls.get(LS_TOKENS,[]);
  if(!tokens.length){S.mine=[];renderMine();return;}
  const {data,error}=await sb.rpc("suivre_commandes",{p_tokens:tokens});
  if(!error){S.mine=data||[];renderMine();}
}

function pickDay(d){
  if(S.cart.date&&S.cart.date!==d&&Object.keys(S.cart.items).length){toast("Panier vidé : un jour par commande");}
  S.selDate=d;if(S.cart.date!==d)S.cart={date:d,items:{}};render();
}
function render(){
  const ds=days();const avail=d=>platsOf(d).some(p=>!p.epuise);
  if(!S.selDate||!ds.includes(S.selDate))S.selDate=ds.find(avail)||ds[0];
  if(S.cart.date!==S.selDate)S.cart={date:S.selDate,items:{}};
  $("#days").innerHTML=ds.map(d=>{const has=avail(d);return `<button type="button" class="day" data-d="${d}" aria-pressed="${d===S.selDate}" ${has?"":"disabled"}><span>${d===today()?"auj.":esc(dayShort(d))}</span><b>${parse(d).getDate()}</b>${has?'<i class="dot"></i>':""}</button>`;}).join("");
  $("#dayTitle").textContent=S.selDate===today()?"La carte du jour":"La carte du "+dayLong(S.selDate);
  const plats=platsOf(S.selDate);
  $("#plats").innerHTML=!plats.length?`<div class="empty"><p>Aucun plat n'est encore publié pour ce jour.</p><p class="small">Choisissez un autre jour marqué d'un point.</p></div>`:
    plats.map(p=>{const q=S.cart.items[p.id]||0;return `<article class="plat ${p.epuise?"off":""}">
      <div class="plat-head"><div><h3 class="plat-name">${esc(p.nom)}</h3>${p.description?`<p class="desc">${esc(p.description)}</p>`:""}</div><div class="price">${eur(p.prix)}</div></div>
      ${macroBlock(p)}
      <div class="plat-foot">${p.epuise?'<span class="pill">Épuisé</span>':`<span class="small muted">${q?q+" dans le panier":"Quantité"}</span>
        <div class="stepper"><button type="button" data-step="-1" data-id="${esc(p.id)}" aria-label="Retirer un ${esc(p.nom)}">−</button><output>${q}</output><button type="button" data-step="1" data-id="${esc(p.id)}" aria-label="Ajouter un ${esc(p.nom)}">+</button></div>`}</div>
    </article>`;}).join("");
  renderCart();
}
function cartLines(){const plats=platsOf(S.cart.date);return Object.entries(S.cart.items).map(([id,q])=>{const p=plats.find(x=>x.id===id);return p&&!p.epuise&&q>0?{p,q}:null;}).filter(Boolean);}
function renderCart(){
  const lines=cartLines();const n=lines.reduce((a,l)=>a+l.q,0),tot=lines.reduce((a,l)=>a+l.q*num(l.p.prix),0);
  $("#cartbar").classList.toggle("show",n>0);
  $("#cartCount").textContent=n+(n>1?" plats":" plat")+" · "+dayLong(S.cart.date||today());
  $("#cartTotal").textContent=eur(tot);
}
function renderMine(){
  const el=$("#mine");
  if(!S.mine.length){el.innerHTML=`<p class="muted small">Vos commandes apparaîtront ici, avec leur avancement.</p>`;return;}
  el.innerHTML=S.mine.map(o=>`<div class="order"><div class="o-head"><div><div class="o-name">${esc(dayLong(o.jour))}</div><div class="o-meta">Livraison ${esc(o.creneau)}</div></div><span class="pill st-${esc(o.statut)}">${esc(STATUS[o.statut]||o.statut)}</span></div>
    <div class="o-items" style="margin-top:10px">${(o.lignes||[]).map(i=>`<div><span>${i.qty} × ${esc(i.nom)}</span><span>${eur(i.qty*num(i.prix))}</span></div>`).join("")}<div class="o-total"><span>Total</span><span>${eur(o.total)}</span></div></div></div>`).join("");
}

$("#days").addEventListener("click",e=>{const b=e.target.closest(".day");if(b&&!b.disabled)pickDay(b.dataset.d);});
$("#plats").addEventListener("click",e=>{const b=e.target.closest("[data-step]");if(!b)return;const id=b.dataset.id;
  const q=Math.max(0,Math.min(20,(S.cart.items[id]||0)+Number(b.dataset.step)));if(q)S.cart.items[id]=q;else delete S.cart.items[id];render();});

$("#openOrder").addEventListener("click",()=>{
  const lines=cartLines();if(!lines.length)return;
  const tot=lines.reduce((a,l)=>a+l.q*num(l.p.prix),0);
  $("#recap").innerHTML=`<div><span class="muted">${esc(dayLong(S.cart.date))}</span></div>`+lines.map(l=>`<div><span>${l.q} × ${esc(l.p.nom)}</span><span>${eur(l.q*num(l.p.prix))}</span></div>`).join("")+`<div class="tot"><span>Total</span><span>${eur(tot)}</span></div>`;
  const c=ls.get(LS_CLIENT,{});["prenom","nom","tel","email","adresse","cp","ville","creneau"].forEach(k=>{if(c[k])$("#f-"+k).value=c[k];});
  $("#orderErr").textContent="";$("#orderDlg").showModal();
});
$("#cancelOrder").addEventListener("click",()=>$("#orderDlg").close());
$("#orderForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=Object.fromEntries([...new FormData(e.target).entries()].map(([k,v])=>[k,String(v).trim()]));
  const miss=["prenom","nom","tel","adresse","cp","ville"].filter(k=>!f[k]);
  if(miss.length){$("#orderErr").textContent="Renseignez les champs marqués d'une étoile.";$("#f-"+miss[0]).focus();return;}
  const lines=cartLines();if(!lines.length){$("#orderDlg").close();return;}
  const btn=$("#sendOrder");btn.disabled=true;$("#orderErr").textContent="";
  const {data,error}=await sb.rpc("passer_commande",{
    p_jour:S.cart.date,p_creneau:f.creneau,p_note:f.note,
    p_client:{prenom:f.prenom,nom:f.nom,tel:f.tel,email:f.email,adresse:f.adresse,cp:f.cp,ville:f.ville},
    p_items:lines.map(l=>({plat_id:l.p.id,qty:l.q}))});
  btn.disabled=false;
  if(error){$("#orderErr").textContent=(error.message&&/[a-zé]{3}/i.test(error.message)&&error.message.length<120)?error.message:"La commande n'est pas partie. Vérifiez votre connexion et réessayez.";loadPlats();return;}
  const tokens=ls.get(LS_TOKENS,[]);tokens.unshift(data.token);ls.set(LS_TOKENS,tokens.slice(0,30));
  ls.set(LS_CLIENT,{prenom:f.prenom,nom:f.nom,tel:f.tel,email:f.email,adresse:f.adresse,cp:f.cp,ville:f.ville,creneau:f.creneau});
  S.cart={date:S.selDate,items:{}};$("#f-note").value="";$("#orderDlg").close();
  toast("Commande envoyée");render();await loadMine();$("#mineWrap").scrollIntoView({behavior:"smooth"});
});

if(!sb){$("#plats").innerHTML=`<div class="empty"><p>Configuration manquante.</p><p class="small">Renseignez l'URL et la clé Supabase dans config.js.</p></div>`;}
else{
  loadPlats();loadMine();
  sb.channel("carte").on("postgres_changes",{event:"*",schema:"public",table:"plats"},()=>loadPlats()).subscribe();
  setInterval(loadMine,30000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){loadPlats();loadMine();}});
}
})();
