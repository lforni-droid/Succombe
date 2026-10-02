(function(){
"use strict";
const {$,esc,addDays,today,eur,num,fmt,dayShort,dayLong,parse,timeOf,STATUS,toast,makeClient}=window.SC;
const sb=makeClient();
const NEXT={nouvelle:["preparation","Accepter"],preparation:["livraison","Partir en livraison"],livraison:["livree","Marquer livrée"]};
const TYPES={plat:{one:"plat",many:"plats",New:"Nouveau plat"},gateau:{one:"gâteau",many:"gâteaux",New:"Nouveau gâteau"}};
const monday=s=>{const d=parse(s);return addDays(s,-((d.getDay()+6)%7));};
const S={tab:"orders",orders:[],oDate:today(),oFilter:"all",fresh:new Set(),carteDay:[],
  produits:[],prog:new Map(),week:addDays(monday(today()),7),editId:null,editType:"plat",
  clients:[],cSearch:"",cFilter:"all",chan:null,poll:null};

function beep(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const c=new A();[0,.18].forEach(d=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.setValueAtTime(.001,c.currentTime+d);g.gain.exponentialRampToValueAtTime(.2,c.currentTime+d+.02);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d+.15);o.connect(g).connect(c.destination);o.start(c.currentTime+d);o.stop(c.currentTime+d+.16);});}catch(e){}}
async function fetchAll(build){let out=[],from=0;for(;;){const {data,error}=await build().range(from,from+999);if(error)throw error;out=out.concat(data||[]);if(!data||data.length<1000)return out;from+=1000;}}
const authErr=e=>e&&(e.code==="PGRST301"||/JWT/i.test(e.message||""));

/* ---------- connexion ---------- */
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
  buildShell();await loadOrders();
  if(!S.chan){S.chan=sb.channel("commandes").on("postgres_changes",{event:"*",schema:"public",table:"commandes"},p=>{
    if(p.eventType==="INSERT"&&p.new){S.fresh.add(p.new.id);beep();toast("Nouvelle commande : "+(p.new.prenom||"")+" "+(p.new.nom||""));}
    loadOrders();if(S.tab==="clients")loadClients();}).subscribe();}
  if(!S.poll)S.poll=setInterval(()=>loadOrders(),60000);
}
$("#logout").addEventListener("click",async()=>{await sb.auth.signOut();if(S.chan){sb.removeChannel(S.chan);S.chan=null;}clearInterval(S.poll);S.poll=null;showLogin();});

/* ---------- structure ---------- */
function buildShell(){
  $("#view").innerHTML=`<div class="tabs" role="tablist">
    <button type="button" role="tab" data-tab="orders" id="tabOrders">Commandes</button>
    <button type="button" role="tab" data-tab="plat">Plats</button>
    <button type="button" role="tab" data-tab="gateau">Gâteaux</button>
    <button type="button" role="tab" data-tab="clients">Clients</button></div><div id="cBody"></div>`;
  $(".tabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b)return;S.tab=b.dataset.tab;buildTab();});
  buildTab();
}
function buildTab(){
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===S.tab)));
  if(S.tab==="orders")buildOrders();
  else if(S.tab==="clients")buildClients();
  else buildCatalogue(S.tab);
  renderBadge();
}

/* ========== COMMANDES ========== */
function buildOrders(){
  $("#cBody").innerHTML=`<div class="inline" style="margin-top:16px"><div style="flex:0 1 200px"><label for="oPick">Autre date</label><input type="date" id="oPick" value="${S.oDate}"></div></div>
    <div class="days" id="oDays" style="margin-top:8px"></div><div class="filters" id="oFilters"></div><div id="prod"></div>
    <details class="carteday" id="carteDay"><summary>Carte du jour</summary><div id="carteList"></div></details><div id="oList"></div>`;
  const setDate=d=>{S.oDate=d;$("#oPick").value=d;loadOrders();loadCarteDay();};
  $("#oPick").addEventListener("change",e=>{if(e.target.value)setDate(e.target.value);});
  $("#oDays").addEventListener("click",e=>{const b=e.target.closest(".day");if(b)setDate(b.dataset.d);});
  $("#oFilters").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.oFilter=b.dataset.f;renderOrders();}});
  $("#oList").addEventListener("click",onOrderAction);
  $("#carteList").addEventListener("click",onEpuise);
  renderOrders();loadCarteDay();
}
function range(){const a=addDays(today(),-1),b=addDays(today(),7);return [S.oDate<a?S.oDate:a,S.oDate>b?S.oDate:b];}
async function loadOrders(){
  const [a,b]=range();
  const {data,error}=await sb.from("commandes").select("*").gte("jour",a).lte("jour",b).order("created_at");
  if(error){if(authErr(error))showLogin("Session expirée, reconnectez-vous.");return;}
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
  const active=day.filter(o=>o.statut!=="annulee");const tally={plat:{},gateau:{}};
  active.forEach(o=>(o.lignes||[]).forEach(i=>{const t=i.type==="gateau"?"gateau":"plat";tally[t][i.nom]=(tally[t][i.nom]||0)+i.qty;}));
  const block=(t,title)=>Object.keys(tally[t]).length?`<h3 style="margin:10px 0 4px">${title}</h3>`+Object.entries(tally[t]).map(([n,q])=>`<div><span>${esc(n)}</span><b>${q}</b></div>`).join(""):"";
  $("#prod").innerHTML=active.length?`<div class="prod"><h3 style="margin-top:0">À produire le ${esc(dayLong(S.oDate))}</h3>${block("plat","Plats")}${block("gateau","Gâteaux")}<div style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><span>Chiffre d'affaires</span><b>${eur(active.reduce((a,o)=>a+num(o.total),0))}</b></div></div>`:"";
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
async function loadCarteDay(){
  const {data}=await sb.from("programmation").select("jour,epuise,produit:produits(id,type,nom,ordre)").eq("jour",S.oDate);
  S.carteDay=(data||[]).filter(r=>r.produit).sort((a,b)=>b.produit.type.localeCompare(a.produit.type)||a.produit.ordre-b.produit.ordre||a.produit.nom.localeCompare(b.produit.nom,"fr"));
  const el=$("#carteList");if(!el)return;
  $("#carteDay summary").textContent=`Carte du ${dayLong(S.oDate)} (${S.carteDay.length})`;
  el.innerHTML=S.carteDay.length?S.carteDay.map(r=>`<div class="li"><span>${esc(r.produit.nom)} <span class="muted small">${r.produit.type==="gateau"?"gâteau":"plat"}</span></span>
      <button class="btn sm ${r.epuise?"accent":"ghost"}" type="button" data-ep="${esc(r.produit.id)}" data-v="${r.epuise?0:1}">${r.epuise?"Remettre en vente":"Épuisé"}</button></div>`).join("")
    :`<p class="small muted" style="margin:0 0 12px">Rien n'est programmé ce jour-là. Cochez les jours dans les onglets Plats et Gâteaux.</p>`;
}
async function onEpuise(e){
  const b=e.target.closest("[data-ep]");if(!b)return;b.disabled=true;
  const {error}=await sb.from("programmation").update({epuise:b.dataset.v==="1"}).eq("produit_id",b.dataset.ep).eq("jour",S.oDate);
  if(error)toast("La modification n'a pas été enregistrée");else toast(b.dataset.v==="1"?"Marqué épuisé":"Remis en vente");
  loadCarteDay();
}

/* ========== CATALOGUE (plats / gâteaux) ========== */
function weekDays(){return Array.from({length:7},(_,i)=>addDays(S.week,i));}
function weekLabel(){
  const a=parse(S.week),b=parse(addDays(S.week,6));
  const m=d=>d.toLocaleDateString("fr-FR",{month:"long"});
  const span=a.getMonth()===b.getMonth()?`${a.getDate()} au ${b.getDate()} ${m(b)}`:`${a.getDate()} ${m(a)} au ${b.getDate()} ${m(b)}`;
  const diff=Math.round((parse(S.week)-parse(monday(today())))/864e5/7);
  return {rel:diff===0?"Cette semaine":diff===1?"Semaine prochaine":diff===-1?"Semaine dernière":"",span:"Du "+span};
}
function buildCatalogue(type){
  const T=TYPES[type];
  $("#cBody").innerHTML=`<div class="toolbar">
      <div class="weeknav"><button type="button" id="wPrev" aria-label="Semaine précédente">‹</button>
        <div><div class="small muted" id="wRel"></div><strong id="wSpan"></strong></div>
        <button type="button" id="wNext" aria-label="Semaine suivante">›</button></div>
      <button class="btn accent sm" type="button" id="addProd">+ ${T.New}</button></div>
    <p class="small muted" style="margin:4px 0 0">Touchez un jour pour proposer le ${T.one} à la commande ce jour-là. Touchez à nouveau pour le retirer.</p>
    <div class="weekhead" id="wHead"></div><div id="pList"><p class="muted">Chargement…</p></div>`;
  $("#wPrev").addEventListener("click",()=>{S.week=addDays(S.week,-7);loadCatalogue();});
  $("#wNext").addEventListener("click",()=>{S.week=addDays(S.week,7);loadCatalogue();});
  $("#addProd").addEventListener("click",()=>openProd(type,null));
  $("#pList").addEventListener("click",onCatalogueClick);
  loadCatalogue();
}
async function loadCatalogue(){
  const type=S.tab;if(!TYPES[type])return;
  const ds=weekDays();
  const [p,g]=await Promise.all([
    sb.from("produits").select("*").eq("type",type).order("ordre").order("nom"),
    sb.from("programmation").select("produit_id,jour,epuise").gte("jour",ds[0]).lte("jour",ds[6])]);
  if(p.error){if(authErr(p.error))return showLogin("Session expirée, reconnectez-vous.");toast("Chargement impossible");return;}
  if(S.tab!==type)return;
  S.produits=p.data||[];S.prog=new Map((g.data||[]).map(r=>[r.produit_id+"|"+r.jour,r]));
  renderCatalogue();
}
function renderCatalogue(){
  const type=S.tab,T=TYPES[type];if(!T||!$("#pList"))return;
  const ds=weekDays(),t=today(),L=weekLabel();
  $("#wRel").textContent=L.rel;$("#wSpan").textContent=L.span;
  $("#wHead").innerHTML=ds.map(d=>{const n=S.produits.filter(p=>S.prog.has(p.id+"|"+d)).length;return `<div><span style="text-transform:capitalize">${esc(dayShort(d))}</span><b>${n}</b></div>`;}).join("");
  if(!S.produits.length){$("#pList").innerHTML=`<div class="empty"><p>Aucun ${T.one} dans le catalogue.</p><p class="small">Ajoutez vos ${T.many} une fois, puis cochez simplement les jours où ils sont proposés.</p></div>`;return;}
  $("#pList").innerHTML=S.produits.map(p=>`<article class="pcard">
    <div class="top"><div><div class="n">${esc(p.nom)}</div>
      <div class="mm">${fmt(p.proteines)} g prot. · ${fmt(p.lipides)} g lip. · ${fmt(p.glucides)} g gluc. · ${fmt(p.kcal)} kcal · <b style="color:var(--ink)">${eur(p.prix)}</b></div></div>
      <div class="acts"><button class="linkbtn" type="button" data-edit="${esc(p.id)}">Modifier</button><button class="linkbtn" type="button" data-del="${esc(p.id)}">Supprimer</button></div></div>
    <div class="wdays">${ds.map(d=>{const r=S.prog.get(p.id+"|"+d);const past=d<t;
      return `<button type="button" class="wd ${r&&r.epuise?"ep":""}" data-pid="${esc(p.id)}" data-d="${d}" aria-pressed="${!!r}" ${past?"disabled":""} aria-label="${esc(p.nom)} le ${esc(dayLong(d))}${r?(r.epuise?" (épuisé)":" (proposé)"):""}"><span>${esc(dayShort(d))}</span><b>${parse(d).getDate()}</b></button>`;}).join("")}</div>
  </article>`).join("");
}
async function onCatalogueClick(e){
  const w=e.target.closest(".wd");
  if(w&&!w.disabled){
    const key=w.dataset.pid+"|"+w.dataset.d,had=S.prog.has(key);
    if(had)S.prog.delete(key);else S.prog.set(key,{produit_id:w.dataset.pid,jour:w.dataset.d,epuise:false});
    renderCatalogue();
    const {error}=had?await sb.from("programmation").delete().eq("produit_id",w.dataset.pid).eq("jour",w.dataset.d)
                     :await sb.from("programmation").insert({produit_id:w.dataset.pid,jour:w.dataset.d});
    if(error){toast("Non enregistré, réessayez");loadCatalogue();}
    return;
  }
  const ed=e.target.closest("[data-edit]");if(ed){openProd(S.tab,S.produits.find(p=>p.id===ed.dataset.edit));return;}
  const dl=e.target.closest("[data-del]");
  if(dl){const p=S.produits.find(x=>x.id===dl.dataset.del);if(!p)return;
    if(!confirm(`Supprimer « ${p.nom} » du catalogue ? Il sera retiré de tous les jours où il est proposé. Les commandes déjà passées ne changent pas.`))return;
    const {error}=await sb.from("produits").delete().eq("id",p.id);
    if(error)toast("La suppression a échoué");else toast("Supprimé");loadCatalogue();}
}

/* fenêtre produit */
const F=["nom","desc","prot","lip","gluc","kcal","prix"];
function openProd(type,p){
  S.editType=type;S.editId=p?p.id:null;
  $("#pfTitle").textContent=p?"Modifier « "+p.nom+" »":TYPES[type].New;
  const v=p?{nom:p.nom,desc:p.description,prot:p.proteines,lip:p.lipides,gluc:p.glucides,kcal:p.kcal,prix:p.prix}:{};
  F.forEach(k=>{const x=v[k];$("#p-"+k).value=(x===undefined||x===null)?"":String(x);});
  $("#pErr").textContent="";$("#prodDlg").showModal();
}
$("#pCancel").addEventListener("click",()=>$("#prodDlg").close());
$("#calc").addEventListener("click",()=>{$("#p-kcal").value=Math.round(num($("#p-prot").value)*4+num($("#p-lip").value)*9+num($("#p-gluc").value)*4);});
$("#prodForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const nom=$("#p-nom").value.trim(),prix=$("#p-prix").value.trim();
  if(!nom||!prix){$("#pErr").textContent="Le nom et le prix de vente sont obligatoires.";return;}
  const row={nom,description:$("#p-desc").value.trim(),proteines:num($("#p-prot").value),lipides:num($("#p-lip").value),glucides:num($("#p-gluc").value),kcal:Math.round(num($("#p-kcal").value)),prix:num(prix)};
  if(!row.kcal&&(row.proteines||row.lipides||row.glucides))row.kcal=Math.round(row.proteines*4+row.lipides*9+row.glucides*4);
  $("#pSave").disabled=true;
  const {error}=S.editId?await sb.from("produits").update(row).eq("id",S.editId)
                        :await sb.from("produits").insert(Object.assign(row,{type:S.editType,ordre:S.produits.length}));
  $("#pSave").disabled=false;
  if(error){$("#pErr").textContent="L'enregistrement a échoué. Réessayez.";return;}
  $("#prodDlg").close();toast(S.editId?"Modifié":"Ajouté au catalogue");loadCatalogue();
});

/* ========== CLIENTS ========== */
function buildClients(){
  $("#cBody").innerHTML=`<div class="toolbar"><input class="search" type="search" id="cSearch" placeholder="Nom, téléphone, ville…" value="${esc(S.cSearch)}" aria-label="Rechercher un client">
      <button class="btn ghost sm" type="button" id="cExport">Exporter (CSV)</button></div>
    <div class="filters" id="cFilters"></div><div id="cList"><p class="muted">Chargement…</p></div>`;
  $("#cSearch").addEventListener("input",e=>{S.cSearch=e.target.value;renderClients();});
  $("#cFilters").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.cFilter=b.dataset.f;renderClients();}});
  $("#cList").addEventListener("click",onClientAction);
  $("#cExport").addEventListener("click",exportClients);
  loadClients();
}
async function loadClients(){
  try{S.clients=await fetchAll(()=>sb.from("clients_vue").select("*").order("nom").order("prenom"));}
  catch(err){if(authErr(err))return showLogin("Session expirée, reconnectez-vous.");if($("#cList"))$("#cList").innerHTML=`<div class="empty"><p>Les clients n'ont pas pu être chargés.</p></div>`;return;}
  renderClients();
}
function filteredClients(){
  const q=S.cSearch.trim().toLowerCase();
  return S.clients.filter(c=>(S.cFilter==="all"||c.optin_fetes)&&(!q||[c.prenom,c.nom,c.tel,c.tel_norm,c.email,c.ville,c.cp].join(" ").toLowerCase().includes(q)));
}
const dateFr=d=>d?new Date(d).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"";
function renderClients(){
  if(S.tab!=="clients"||!$("#cList"))return;
  const nOpt=S.clients.filter(c=>c.optin_fetes).length;
  $("#cFilters").innerHTML=`<button type="button" data-f="all" aria-pressed="${S.cFilter==="all"}">Tous (${S.clients.length})</button><button type="button" data-f="optin" aria-pressed="${S.cFilter==="optin"}">Accord mails fêtes (${nOpt})</button>`;
  const list=filteredClients();
  if(!list.length){$("#cList").innerHTML=`<div class="empty"><p>${S.clients.length?"Aucun client ne correspond.":"Aucun client pour l'instant."}</p><p class="small">Chaque commande crée ou met à jour la fiche du client, reconnu par son numéro de téléphone.</p></div>`;return;}
  $("#cList").innerHTML=list.map(c=>{const adr=[c.adresse,c.cp,c.ville].filter(Boolean).join(", ");return `<article class="order">
    <div class="o-head"><div><div class="o-name">${esc(c.prenom)} ${esc(c.nom)}</div><div class="o-meta">Client depuis le ${esc(dateFr(c.created_at))}</div></div>
      ${c.optin_fetes?`<span class="pill ok" title="${esc(c.optin_source||"")}">Mails fêtes : oui</span>`:`<span class="pill">Mails fêtes : non</span>`}</div>
    <dl class="o-info"><dt>Tél.</dt><dd><a href="tel:${esc(String(c.tel).replace(/\s/g,""))}">${esc(c.tel)}</a></dd>
      ${c.email?`<dt>E-mail</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>`:""}
      ${adr?`<dt>Adresse</dt><dd><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adr)}" target="_blank" rel="noopener">${esc(adr)}</a></dd>`:""}</dl>
    <div class="cstats">${c.nb_commandes} commande${c.nb_commandes>1?"s":""} · ${eur(c.total_depense)}${c.derniere_commande?" · dernière le "+esc(dayLong(c.derniere_commande)):""}</div>
    ${c.optin_date?`<div class="cstats">${c.optin_fetes?"Accord donné":"Accord retiré ou refusé"} le ${esc(dateFr(c.optin_date))}${c.optin_source?" ("+esc(c.optin_source.toLowerCase())+")":""}</div>`:""}
    ${c.optin_fetes?`<div class="o-actions"><button class="btn sm ghost" type="button" data-optout="${esc(c.id)}">Retirer l'accord mails fêtes</button></div>`:""}
  </article>`;}).join("");
}
async function onClientAction(e){
  const b=e.target.closest("[data-optout]");if(!b)return;
  if(!confirm("Retirer l'accord de ce client ? Il ne devra plus recevoir d'e-mails promotionnels."))return;
  b.disabled=true;
  const {error}=await sb.from("clients").update({optin_fetes:false,optin_date:new Date().toISOString(),optin_source:"Retrait enregistré par le restaurateur"}).eq("id",b.dataset.optout);
  if(error){b.disabled=false;toast("La modification n'a pas été enregistrée");return;}
  toast("Accord retiré");loadClients();
}
function exportClients(){
  const list=filteredClients();if(!list.length)return toast("Aucun client à exporter");
  const cols=[["Prénom","prenom"],["Nom","nom"],["Téléphone","tel"],["E-mail","email"],["Adresse","adresse"],["Code postal","cp"],["Ville","ville"],["Commandes","nb_commandes"],["Total dépensé (€)",c=>num(c.total_depense).toFixed(2).replace(".",",")],["Dernière commande",c=>c.derniere_commande?c.derniere_commande.split("-").reverse().join("/"):""],["Accord mails fêtes",c=>c.optin_fetes?"oui":"non"],["Date de l'accord",c=>c.optin_date?new Date(c.optin_date).toLocaleDateString("fr-FR"):""]];
  const cell=v=>{const s=String(v==null?"":v);return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const csv="\ufeff"+[cols.map(c=>c[0]).join(";")].concat(list.map(c=>cols.map(([,k])=>cell(typeof k==="function"?k(c):c[k])).join(";"))).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  a.download=`succombe-clients${S.cFilter==="optin"?"-mails-fetes":""}-${today()}.csv`;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}

if(!sb)$("#view").innerHTML=`<div class="empty" style="margin-top:28px"><p>Configuration manquante.</p><p class="small">Renseignez l'URL et la clé Supabase dans config.js.</p></div>`;
else start();
})();
