(function(){
"use strict";
const {$,esc,addDays,today,eur,num,fmt,dayShort,dayLong,parse,timeOf,STATUS,toast,makeClient}=window.SC;
const sb=makeClient();
const NEXT={nouvelle:["preparation","Accepter"],preparation:["livraison","Partir en livraison"],livraison:["livree","Marquer livrée"]};
const S={orders:[],plats:[],jours:[],tab:"orders",oDate:today(),oFilter:"all",mDate:today(),editId:null,fresh:new Set(),chan:null,poll:null};

function beep(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const c=new A();[0,.18].forEach(d=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.setValueAtTime(.001,c.currentTime+d);g.gain.exponentialRampToValueAtTime(.2,c.currentTime+d+.02);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d+.15);o.connect(g).connect(c.destination);o.start(c.currentTime+d);o.stop(c.currentTime+d+.16);});}catch(e){}}

/* ---------- auth ---------- */
function showLogin(msg){
  $("#logout").hidden=true;
  $("#view").innerHTML=`<form class="login" id="loginForm" novalidate><h2>Connexion</h2>
    <div class="field"><label for="l-email">E-mail</label><input id="l-email" type="email" autocomplete="username" required></div>
    <div class="field"><label for="l-pass">Mot de passe</label><input id="l-pass" type="password" autocomplete="current-password" required></div>
    <div class="err" id="lErr">${esc(msg||"")}</div><div class="row"><button class="btn" type="submit" id="lBtn">Se connecter</button></div></form>`;
  $("#loginForm").addEventListener("submit",async e=>{e.preventDefault();$("#lBtn").disabled=true;
    const {error}=await sb.auth.signInWithPassword({email:$("#l-email").value.trim(),password:$("#l-pass").value});
    $("#lBtn").disabled=false;if(error)$("#lErr").textContent="E-mail ou mot de passe incorrect.";else start();});
}
async function start(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return showLogin();
  const {data:isAdmin}=await sb.rpc("is_admin");
  if(!isAdmin){await sb.auth.signOut();return showLogin("Ce compte n'a pas accès à l'espace cuisine.");}
  $("#logout").hidden=false;
  buildShell();await Promise.all([loadOrders(true),loadJours()]);
  if(!S.chan){S.chan=sb.channel("commandes").on("postgres_changes",{event:"*",schema:"public",table:"commandes"},p=>{
    if(p.eventType==="INSERT"&&p.new){S.fresh.add(p.new.id);beep();toast("Nouvelle commande : "+(p.new.prenom||"")+" "+(p.new.nom||""));}
    loadOrders();}).subscribe();}
  if(!S.poll)S.poll=setInterval(()=>loadOrders(),60000);
}
$("#logout").addEventListener("click",async()=>{await sb.auth.signOut();if(S.chan){sb.removeChannel(S.chan);S.chan=null;}clearInterval(S.poll);S.poll=null;showLogin();});

/* ---------- shell ---------- */
function buildShell(){
  $("#view").innerHTML=`<div class="tabs" role="tablist">
    <button type="button" role="tab" data-tab="orders" id="tabOrders">Commandes</button>
    <button type="button" role="tab" data-tab="menu">Carte du jour</button></div><div id="cBody"></div>`;
  $(".tabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b)return;S.tab=b.dataset.tab;S.editId=null;buildTab();});
  buildTab();
}
function buildTab(){
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===S.tab)));
  if(S.tab==="orders"){
    $("#cBody").innerHTML=`<div class="inline" style="margin-top:16px"><div style="flex:0 1 200px"><label for="oPick">Autre date</label><input type="date" id="oPick" value="${S.oDate}"></div></div>
      <div class="days" id="oDays" style="margin-top:8px"></div><div class="filters" id="oFilters"></div><div id="prod"></div><div id="oList"></div>`;
    $("#oPick").addEventListener("change",e=>{if(e.target.value){S.oDate=e.target.value;loadOrders();}});
    $("#oDays").addEventListener("click",e=>{const b=e.target.closest(".day");if(b){S.oDate=b.dataset.d;$("#oPick").value=S.oDate;loadOrders();}});
    $("#oFilters").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.oFilter=b.dataset.f;renderOrders();}});
    $("#oList").addEventListener("click",onOrderAction);
    renderOrders();
  }else buildMenuEditor();
  renderBadge();
}

/* ---------- commandes ---------- */
function range(){const a=addDays(today(),-1),b=addDays(today(),7);return [S.oDate<a?S.oDate:a,S.oDate>b?S.oDate:b];}
async function loadOrders(){
  const [a,b]=range();
  const {data,error}=await sb.from("commandes").select("*").gte("jour",a).lte("jour",b).order("created_at");
  if(error){if(error.code==="PGRST301"||/JWT/i.test(error.message))showLogin("Session expirée, reconnectez-vous.");return;}
  S.orders=data||[];renderBadge();renderOrders();
}
function renderBadge(){const t=$("#tabOrders");if(!t)return;const n=S.orders.filter(o=>o.statut==="nouvelle").length;t.innerHTML="Commandes"+(n?`<span class="badge">${n}</span>`:"");}
function renderOrders(){
  if(S.tab!=="orders"||!$("#oList"))return;
  const ds=Array.from({length:9},(_,i)=>addDays(today(),i-1));
  $("#oDays").innerHTML=ds.map(d=>{const n=S.orders.filter(o=>o.jour===d&&o.statut!=="annulee").length;return `<button type="button" class="day" data-d="${d}" aria-pressed="${d===S.oDate}"><span>${d===today()?"auj.":esc(dayShort(d))}</span><b>${parse(d).getDate()}</b><span>${n?n+" cde"+(n>1?"s":""):"–"}</span></button>`;}).join("");
  const day=S.orders.filter(o=>o.jour===S.oDate);
  const F=[["all","Toutes"],["nouvelle","Nouvelles"],["preparation","En préparation"],["livraison","En livraison"],["livree","Livrées"],["annulee","Annulées"]];
  $("#oFilters").innerHTML=F.map(([k,l])=>`<button type="button" data-f="${k}" aria-pressed="${S.oFilter===k}">${l} (${k==="all"?day.length:day.filter(o=>o.statut===k).length})</button>`).join("");
  const active=day.filter(o=>o.statut!=="annulee");const tally={};
  active.forEach(o=>(o.lignes||[]).forEach(i=>{tally[i.nom]=(tally[i.nom]||0)+i.qty;}));
  $("#prod").innerHTML=Object.keys(tally).length?`<div class="prod"><h3 style="margin-top:0">À produire le ${esc(dayLong(S.oDate))}</h3>${Object.entries(tally).map(([n,q])=>`<div><span>${esc(n)}</span><b>${q}</b></div>`).join("")}<div style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><span>Chiffre d'affaires</span><b>${eur(active.reduce((a,o)=>a+num(o.total),0))}</b></div></div>`:"";
  const list=(S.oFilter==="all"?day:day.filter(o=>o.statut===S.oFilter)).sort((a,b)=>String(a.creneau).localeCompare(String(b.creneau))||String(a.created_at).localeCompare(String(b.created_at)));
  if(!list.length){$("#oList").innerHTML=`<div class="empty"><p>Aucune commande ${S.oFilter==="all"?"":"dans cet état "}pour ce jour.</p><p class="small">Les nouvelles commandes arrivent ici en direct, avec un signal sonore.</p></div>`;return;}
  $("#oList").innerHTML=list.map(o=>{
    const adr=[o.adresse,o.cp,o.ville].filter(Boolean).join(", ");const kcal=(o.lignes||[]).reduce((a,i)=>a+i.qty*num(i.kcal),0);const nx=NEXT[o.statut];
    const btn=(act,label,cls)=>`<button class="btn sm ${cls}" type="button" data-act="${act}" data-id="${esc(o.id)}">${label}</button>`;
    return `<article class="order ${S.fresh.has(o.id)&&o.statut==="nouvelle"?"fresh":""}">
      <div class="o-head"><div><div class="o-name">${esc(o.prenom)} ${esc(o.nom)}</div><div class="o-meta">Livraison ${esc(o.creneau)} · reçue à ${timeOf(o.created_at)}</div></div><span class="pill st-${esc(o.statut)}">${esc(STATUS[o.statut]||o.statut)}</span></div>
      <dl class="o-info"><dt>Tél.</dt><dd><a href="tel:${esc(String(o.tel).replace(/\s/g,""))}">${esc(o.tel)}</a></dd>
        ${o.email?`<dt>E-mail</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd>`:""}
        <dt>Adresse</dt><dd><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adr)}" target="_blank" rel="noopener">${esc(adr)}</a></dd></dl>
      <div class="o-items">${(o.lignes||[]).map(i=>`<div><span>${i.qty} × ${esc(i.nom)}</span><span>${eur(i.qty*num(i.prix))}</span></div>`).join("")}
        <div class="o-total"><span>Total</span><span>${eur(o.total)}</span></div><div class="small muted">${fmt(kcal)} kcal au total</div></div>
      ${o.note?`<div class="o-note">${esc(o.note)}</div>`:""}
      <div class="o-actions">${nx?btn(nx[0],nx[1],o.statut==="nouvelle"?"accent":""):""}
        ${o.statut!=="annulee"&&o.statut!=="livree"?btn("annulee","Annuler","ghost"):""}
        ${o.statut==="annulee"?btn("nouvelle","Rétablir","ghost"):""}</div></article>`;}).join("");
}
async function onOrderAction(e){
  const b=e.target.closest("[data-act]");if(!b)return;
  if(b.dataset.act==="annulee"&&!confirm("Annuler cette commande ?"))return;
  b.disabled=true;
  const {error}=await sb.from("commandes").update({statut:b.dataset.act}).eq("id",b.dataset.id);
  if(error){b.disabled=false;toast("La mise à jour n'a pas été enregistrée");return;}
  S.fresh.delete(b.dataset.id);toast(STATUS[b.dataset.act]);loadOrders();
}

/* ---------- carte ---------- */
async function loadJours(){const {data}=await sb.from("plats").select("jour").order("jour",{ascending:false}).limit(1000);S.jours=[...new Set((data||[]).map(r=>r.jour))];}
async function loadPlats(){const {data,error}=await sb.from("plats").select("*").eq("jour",S.mDate).order("ordre").order("created_at");if(!error)S.plats=data||[];renderMenu();}
function buildMenuEditor(){
  $("#cBody").innerHTML=`<div class="inline" style="margin-top:18px"><div style="flex:0 1 200px"><label for="mDate">Jour de la carte</label><input type="date" id="mDate" value="${S.mDate}"></div></div>
    <h2 id="mTitle"></h2><div id="mList"></div>
    <form class="formcard" id="platForm" novalidate><h3 style="margin-top:0" id="pfTitle">Ajouter un plat</h3>
      <div class="grid">
        <div class="full"><label for="p-nom">Nom du plat *</label><input id="p-nom" required maxlength="120"></div>
        <div class="full"><label for="p-desc">Description</label><textarea id="p-desc" maxlength="600"></textarea></div>
        <div><label for="p-prot">Protéines (g)</label><input id="p-prot" inputmode="decimal"></div>
        <div><label for="p-lip">Lipides (g)</label><input id="p-lip" inputmode="decimal"></div>
        <div><label for="p-gluc">Glucides (g)</label><input id="p-gluc" inputmode="decimal"></div>
        <div><label for="p-kcal">Calories (kcal)</label><input id="p-kcal" inputmode="decimal"><button type="button" class="linkbtn" id="calc" style="margin-top:4px">Calculer depuis les macros</button></div>
        <div><label for="p-prix">Prix de vente (€) *</label><input id="p-prix" inputmode="decimal" required></div>
      </div><div class="err" id="pErr"></div>
      <div class="row"><button type="button" class="btn ghost" id="pCancel" hidden>Annuler la modification</button><button class="btn" type="submit" id="pSave">Ajouter le plat</button></div></form>
    <div class="formcard"><h3 style="margin-top:0">Reprendre une carte existante</h3>
      <div class="inline"><div><label for="copyFrom">Copier depuis</label><select id="copyFrom"></select></div><button type="button" class="btn ghost" id="copyBtn">Copier sur ce jour</button></div></div>`;
  $("#mDate").addEventListener("change",e=>{if(e.target.value){S.mDate=e.target.value;resetForm();loadPlats();}});
  $("#calc").addEventListener("click",()=>{$("#p-kcal").value=Math.round(num($("#p-prot").value)*4+num($("#p-lip").value)*9+num($("#p-gluc").value)*4);});
  $("#pCancel").addEventListener("click",resetForm);
  $("#platForm").addEventListener("submit",savePlat);
  $("#mList").addEventListener("click",onPlatAction);
  $("#copyBtn").addEventListener("click",copyMenu);
  loadPlats();
}
function renderMenu(){
  if(S.tab!=="menu"||!$("#mList"))return;
  $("#mTitle").textContent="Carte du "+dayLong(S.mDate);
  $("#mList").innerHTML=S.plats.length?S.plats.map(p=>`<div class="admin-plat"><div><div class="n">${esc(p.nom)}</div>
      <div class="mm">${fmt(p.proteines)} g prot. · ${fmt(p.lipides)} g lip. · ${fmt(p.glucides)} g gluc. · ${fmt(p.kcal)} kcal</div>
      <div style="margin-top:6px"><b>${eur(p.prix)}</b> ${p.epuise?'<span class="pill">Épuisé</span>':""}</div></div>
      <div class="acts"><button class="linkbtn" type="button" data-pa="edit" data-id="${esc(p.id)}">Modifier</button>
      <button class="linkbtn" type="button" data-pa="stock" data-id="${esc(p.id)}">${p.epuise?"Remettre en vente":"Marquer épuisé"}</button>
      <button class="linkbtn" type="button" data-pa="del" data-id="${esc(p.id)}">Supprimer</button></div></div>`).join("")
    :`<div class="empty"><p>Aucun plat pour ce jour.</p><p class="small">Ajoutez un plat ci-dessous, il sera visible des clients dès l'enregistrement.</p></div>`;
  const others=S.jours.filter(d=>d!==S.mDate);
  $("#copyFrom").innerHTML=others.length?others.map(d=>`<option value="${d}">${esc(dayLong(d))}</option>`).join(""):`<option value="">Aucune autre carte</option>`;
  $("#copyBtn").disabled=!others.length;
}
function resetForm(){S.editId=null;["nom","desc","prot","lip","gluc","kcal","prix"].forEach(k=>{const el=$("#p-"+k);if(el)el.value="";});
  if($("#pfTitle")){$("#pfTitle").textContent="Ajouter un plat";$("#pSave").textContent="Ajouter le plat";$("#pCancel").hidden=true;$("#pErr").textContent="";}}
async function savePlat(e){
  e.preventDefault();
  const nom=$("#p-nom").value.trim(),prix=$("#p-prix").value.trim();
  if(!nom||!prix){$("#pErr").textContent="Le nom et le prix de vente sont obligatoires.";return;}
  const row={jour:S.mDate,nom,description:$("#p-desc").value.trim(),proteines:num($("#p-prot").value),lipides:num($("#p-lip").value),glucides:num($("#p-gluc").value),kcal:Math.round(num($("#p-kcal").value)),prix:num(prix)};
  if(!row.kcal&&(row.proteines||row.lipides||row.glucides))row.kcal=Math.round(row.proteines*4+row.lipides*9+row.glucides*4);
  $("#pSave").disabled=true;
  const q=S.editId?sb.from("plats").update(row).eq("id",S.editId):sb.from("plats").insert(Object.assign(row,{ordre:S.plats.length}));
  const {error}=await q;$("#pSave").disabled=false;
  if(error){$("#pErr").textContent="L'enregistrement a échoué. Réessayez.";return;}
  toast(S.editId?"Plat modifié":"Plat ajouté à la carte");resetForm();loadPlats();loadJours().then(renderMenu);
}
async function onPlatAction(e){
  const b=e.target.closest("[data-pa]");if(!b)return;const p=S.plats.find(x=>x.id===b.dataset.id);if(!p)return;
  if(b.dataset.pa==="edit"){S.editId=p.id;
    $("#p-nom").value=p.nom||"";$("#p-desc").value=p.description||"";$("#p-prot").value=p.proteines||"";$("#p-lip").value=p.lipides||"";$("#p-gluc").value=p.glucides||"";$("#p-kcal").value=p.kcal||"";$("#p-prix").value=p.prix||"";
    $("#pfTitle").textContent="Modifier « "+p.nom+" »";$("#pSave").textContent="Enregistrer les modifications";$("#pCancel").hidden=false;
    $("#platForm").scrollIntoView({behavior:"smooth"});return;}
  let r;
  if(b.dataset.pa==="del"){if(!confirm("Supprimer ce plat de la carte ?"))return;r=await sb.from("plats").delete().eq("id",p.id);}
  else r=await sb.from("plats").update({epuise:!p.epuise}).eq("id",p.id);
  if(r.error)toast("La modification n'a pas été enregistrée");loadPlats();
}
async function copyMenu(){
  const from=$("#copyFrom").value;if(!from)return;
  if(S.plats.length&&!confirm("Remplacer la carte de ce jour ?"))return;
  const {data,error}=await sb.from("plats").select("*").eq("jour",from).order("ordre");
  if(error||!data)return toast("La copie a échoué");
  if(S.plats.length){const d=await sb.from("plats").delete().eq("jour",S.mDate);if(d.error)return toast("La copie a échoué");}
  const rows=data.map(({id,created_at,...p})=>Object.assign(p,{jour:S.mDate,epuise:false}));
  const ins=await sb.from("plats").insert(rows);
  if(ins.error)return toast("La copie a échoué");
  toast("Carte copiée");loadPlats();loadJours().then(renderMenu);
}

if(!sb)$("#view").innerHTML=`<div class="empty" style="margin-top:28px"><p>Configuration manquante.</p><p class="small">Renseignez l'URL et la clé Supabase dans config.js.</p></div>`;
else start();
})();
