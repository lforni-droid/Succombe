(function(){
"use strict";
const {CATEGORIES,$,esc,addDays,today,eur,num,fmt,dayShort,dayLong,parse,timeOf,STATUS,toast,makeClient}=window.SC;
const sb=makeClient();
const NEXT={nouvelle:["preparation","Accepter"],preparation:["livraison","Partir en livraison"],livraison:["livree","Marquer livrée"]};
const TYPES={plat:{one:"plat",many:"plats",New:"Nouveau plat"},gateau:{one:"gâteau",many:"gâteaux",New:"Nouveau gâteau"}};
const monday=s=>{const d=parse(s);return addDays(s,-((d.getDay()+6)%7));};
const S={tab:"orders",orders:[],oDate:today(),oFilter:"all",fresh:new Set(),carteDay:[],
  produits:[],prog:new Map(),week:addDays(monday(today()),7),editId:null,editType:"plat",
  catFilter:"all",notes:{},openAvis:null,clients:[],cSearch:"",cFilter:"all",chan:null,poll:null};

function beep(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const c=new A();[0,.18].forEach(d=>{const o=c.createOscillator(),g=c.createGain();o.frequency.value=880;g.gain.setValueAtTime(.001,c.currentTime+d);g.gain.exponentialRampToValueAtTime(.2,c.currentTime+d+.02);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+d+.15);o.connect(g).connect(c.destination);o.start(c.currentTime+d);o.stop(c.currentTime+d+.16);});}catch(e){}}
async function fetchAll(build){let out=[],from=0;for(;;){const {data,error}=await build().range(from,from+999);if(error)throw error;out=out.concat(data||[]);if(!data||data.length<1000)return out;from+=1000;}}
const authErr=e=>e&&(e.code==="PGRST301"||/JWT/i.test(e.message||""));

/* ---------- connexion ---------- */
function showLogin(msg){
  $("#logout").hidden=true;$("#pwdBtn").hidden=true;
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
  $("#logout").hidden=false;$("#pwdBtn").hidden=false;
  const meta=(session.user&&session.user.user_metadata)||{};
  if(meta.doit_changer_mdp){showPwd(true);return;}
  openApp();
}
async function openApp(){
  buildShell();await loadOrders();
  if(!S.chan){S.chan=sb.channel("commandes").on("postgres_changes",{event:"*",schema:"public",table:"commandes"},p=>{
    if(p.eventType==="INSERT"&&p.new){S.fresh.add(p.new.id);beep();toast("Nouvelle commande : "+(p.new.prenom||"")+" "+(p.new.nom||""));}
    loadOrders();if(S.tab==="clients")loadClients();}).subscribe();}
  if(!S.poll)S.poll=setInterval(()=>loadOrders(),60000);
}
$("#logout").addEventListener("click",async()=>{await sb.auth.signOut();if(S.chan){sb.removeChannel(S.chan);S.chan=null;}clearInterval(S.poll);S.poll=null;showLogin();});


/* ---------- mot de passe ---------- */
function showPwd(forced){
  $("#view").innerHTML=`<form class="login" id="pwdForm" novalidate><h2>${forced?"Bienvenue":"Mot de passe"}</h2>
    <p class="small muted" style="margin-top:0">${forced?"Pour votre première connexion, choisissez votre propre mot de passe.":"Choisissez un nouveau mot de passe."}</p>
    <div class="field"><label for="n-pass">Nouveau mot de passe (8 caractères minimum)</label><input id="n-pass" type="password" autocomplete="new-password" minlength="8" required></div>
    <div class="field"><label for="n-pass2">Confirmez-le</label><input id="n-pass2" type="password" autocomplete="new-password" required></div>
    <div class="err" id="nErr"></div>
    <div class="row">${forced?"":'<button class="btn ghost" type="button" id="nCancel">Annuler</button>'}<button class="btn" type="submit" id="nBtn">Enregistrer</button></div></form>`;
  if(!forced)$("#nCancel").addEventListener("click",openApp);
  $("#pwdForm").addEventListener("submit",async e=>{
    e.preventDefault();const a=$("#n-pass").value,b=$("#n-pass2").value;
    if(a.length<8){$("#nErr").textContent="Le mot de passe doit faire au moins 8 caractères.";return;}
    if(a!==b){$("#nErr").textContent="Les deux mots de passe ne sont pas identiques.";return;}
    $("#nBtn").disabled=true;
    const {error}=await sb.auth.updateUser({password:a,data:{doit_changer_mdp:false}});
    $("#nBtn").disabled=false;
    if(error){$("#nErr").textContent=/same|different/i.test(error.message||"")?"Choisissez un mot de passe différent du mot de passe provisoire.":"Le mot de passe n'a pas pu être enregistré. Réessayez.";return;}
    toast("Mot de passe enregistré");openApp();
  });
}
$("#pwdBtn").addEventListener("click",()=>showPwd(false));

/* ---------- structure ---------- */
function buildShell(){
  $("#view").innerHTML=`<div class="tabs" role="tablist">
    <button type="button" role="tab" data-tab="orders" id="tabOrders">Commandes</button>
    <button type="button" role="tab" data-tab="plat">Plats</button>
    <button type="button" role="tab" data-tab="gateau">Gâteaux</button>
    <button type="button" role="tab" data-tab="clients">Clients</button>
    <button type="button" role="tab" data-tab="releves">Relevés</button>
    <button type="button" role="tab" data-tab="equipe">Équipe</button></div><div id="cBody"></div>`;
  $(".tabs").addEventListener("click",e=>{const b=e.target.closest("[data-tab]");if(!b)return;S.tab=b.dataset.tab;S.relClient=null;buildTab();});
  buildTab();
}
function buildTab(){
  document.querySelectorAll(".tabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===S.tab)));
  if(S.tab==="orders")buildOrders();
  else if(S.tab==="clients")buildClients();
  else if(S.tab==="equipe")buildEquipe();
  else if(S.tab==="releves")buildReleves();
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
        ${o.statut!=="annulee"?btn("annulee","Annuler la commande","ghost"):""}
        ${o.statut==="annulee"?btn("nouvelle","Rétablir","ghost"):""}</div></article>`;}).join("");
}
async function onOrderAction(e){
  const b=e.target.closest("[data-act]");if(!b)return;
  if(b.dataset.act==="annulee"){const o=S.orders.find(x=>x.id===b.dataset.id);
    const stade=o&&o.statut!=="nouvelle"?" Elle est actuellement « "+(STATUS[o.statut]||o.statut).toLowerCase()+" ».":"";
    if(!confirm("Annuler cette commande ?"+stade+" Elle ne sera plus comptée dans la production ni dans le chiffre d'affaires."))return;}
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
    ${type==="plat"?'<div class="filters" id="catFilters"></div>':""}
    <div class="weekhead" id="wHead"></div><div id="pList"><p class="muted">Chargement…</p></div>`;
  $("#wPrev").addEventListener("click",()=>{S.week=addDays(S.week,-7);loadCatalogue();});
  $("#wNext").addEventListener("click",()=>{S.week=addDays(S.week,7);loadCatalogue();});
  $("#addProd").addEventListener("click",()=>openProd(type,null));
  $("#pList").addEventListener("click",onCatalogueClick);
  if($("#catFilters"))$("#catFilters").addEventListener("click",e=>{const b=e.target.closest("button");if(b){S.catFilter=b.dataset.c;renderCatalogue();}});
  loadCatalogue();
}
async function loadCatalogue(){
  const type=S.tab;if(!TYPES[type])return;
  const ds=weekDays();
  const [p,g,n]=await Promise.all([
    sb.from("produits").select("*").eq("type",type).order("ordre").order("nom"),
    sb.from("programmation").select("produit_id,jour,epuise").gte("jour",ds[0]).lte("jour",ds[6]),
    sb.rpc("notes_moyennes")]);
  if(!n.error){const o={};(n.data||[]).forEach(r=>{o[r.produit_id]=r;});S.notes=o;}
  if(p.error){if(authErr(p.error))return showLogin("Session expirée, reconnectez-vous.");toast("Chargement impossible");return;}
  if(S.tab!==type)return;
  S.produits=p.data||[];S.prog=new Map((g.data||[]).map(r=>[r.produit_id+"|"+r.jour,r]));
  renderCatalogue();
}
function renderCatalogue(){
  const type=S.tab,T=TYPES[type];if(!T||!$("#pList"))return;
  const ds=weekDays(),t=today(),L=weekLabel();
  $("#wRel").textContent=L.rel;$("#wSpan").textContent=L.span;
  let shown=S.produits;
  if(type==="plat"&&$("#catFilters")){
    const cnt=k=>S.produits.filter(p=>k==="all"?true:k==="none"?!p.categorie:p.categorie===k).length;
    const keys=["all",...Object.keys(CATEGORIES)].concat(cnt("none")?["none"]:[]);
    if(!keys.includes(S.catFilter))S.catFilter="all";
    $("#catFilters").innerHTML=keys.map(k=>`<button type="button" data-c="${k}" aria-pressed="${S.catFilter===k}">${k==="all"?"Tous":k==="none"?"Sans catégorie":CATEGORIES[k]} (${cnt(k)})</button>`).join("");
    if(S.catFilter!=="all")shown=S.produits.filter(p=>S.catFilter==="none"?!p.categorie:p.categorie===S.catFilter);
  }
  $("#wHead").innerHTML=ds.map(d=>{const n=shown.filter(p=>S.prog.has(p.id+"|"+d)).length;return `<div><span style="text-transform:capitalize">${esc(dayShort(d))}</span><b>${n}</b></div>`;}).join("");
  if(!S.produits.length){$("#pList").innerHTML=`<div class="empty"><p>Aucun ${T.one} dans le catalogue.</p><p class="small">Ajoutez vos ${T.many} une fois, puis cochez simplement les jours où ils sont proposés.</p></div>`;return;}
  if(!shown.length){$("#pList").innerHTML=`<div class="empty"><p>Aucun plat dans cette catégorie.</p></div>`;return;}
  $("#pList").innerHTML=shown.map(p=>{const nt=S.notes[p.id];return `<article class="pcard">
    <div class="top"><div>${p.categorie&&CATEGORIES[p.categorie]?`<span class="cat">${CATEGORIES[p.categorie]}</span>`:""}<div class="n">${esc(p.nom)}</div>
      <div class="mm">${fmt(p.proteines)} g prot. · ${fmt(p.lipides)} g lip. · ${fmt(p.glucides)} g gluc. · ${fmt(p.kcal)} kcal · <b style="color:var(--ink)">${eur(p.prix)}</b></div>
      ${nt?`<div class="rating"><b>★ ${String(nt.moyenne).replace(".",",")}</b> · ${nt.nb} avis · <button class="linkbtn" type="button" data-avis="${esc(p.id)}">${S.openAvis===p.id?"Masquer les avis":"Voir les avis"}</button></div>`:`<div class="rating">Pas encore noté</div>`}</div>
      <div class="acts"><button class="linkbtn" type="button" data-edit="${esc(p.id)}">Modifier</button><button class="linkbtn" type="button" data-del="${esc(p.id)}">Supprimer</button></div></div>
    <div class="wdays">${ds.map(d=>{const r=S.prog.get(p.id+"|"+d);const past=d<t;
      return `<button type="button" class="wd ${r&&r.epuise?"ep":""}" data-pid="${esc(p.id)}" data-d="${d}" aria-pressed="${!!r}" ${past?"disabled":""} aria-label="${esc(p.nom)} le ${esc(dayLong(d))}${r?(r.epuise?" (épuisé)":" (proposé)"):""}"><span>${esc(dayShort(d))}</span><b>${parse(d).getDate()}</b></button>`;}).join("")}</div>
    ${S.openAvis===p.id?`<div class="avis-list" id="avis-${esc(p.id)}"><p class="small muted">Chargement des avis…</p></div>`:""}
  </article>`;}).join("");
  if(S.openAvis&&document.getElementById("avis-"+S.openAvis))loadAvis(S.openAvis);
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
  const av=e.target.closest("[data-avis]");if(av){S.openAvis=S.openAvis===av.dataset.avis?null:av.dataset.avis;renderCatalogue();return;}
  const ed=e.target.closest("[data-edit]");if(ed){openProd(S.tab,S.produits.find(p=>p.id===ed.dataset.edit));return;}
  const dl=e.target.closest("[data-del]");
  if(dl){const p=S.produits.find(x=>x.id===dl.dataset.del);if(!p)return;
    if(!confirm(`Supprimer « ${p.nom} » du catalogue ? Il sera retiré de tous les jours où il est proposé. Les commandes déjà passées ne changent pas.`))return;
    const {error}=await sb.from("produits").delete().eq("id",p.id);
    if(error)toast("La suppression a échoué");else toast("Supprimé");loadCatalogue();}
}

async function loadAvis(pid){
  const {data,error}=await sb.from("avis").select("note,commentaire,updated_at,commande:commandes(prenom,nom,jour)").eq("produit_id",pid).order("updated_at",{ascending:false}).limit(100);
  const el=document.getElementById("avis-"+pid);if(!el)return;
  if(error){el.innerHTML=`<p class="small muted">Les avis n'ont pas pu être chargés.</p>`;return;}
  el.innerHTML=(data||[]).length?(data||[]).map(a=>`<div class="a"><b style="color:var(--caramel)">${"★".repeat(a.note)}<span style="color:var(--line)">${"★".repeat(5-a.note)}</span></b>
      <span class="small muted">${a.commande?esc(a.commande.prenom+" "+(a.commande.nom||"").slice(0,1)+"."):""} · ${esc(new Date(a.updated_at).toLocaleDateString("fr-FR"))}</span>
      ${a.commentaire?`<div>${esc(a.commentaire)}</div>`:""}</div>`).join(""):`<p class="small muted">Aucun avis.</p>`;
}

/* fenêtre produit */
const F=["nom","desc","prot","lip","gluc","kcal","prix"];
function openProd(type,p){
  S.editType=type;S.editId=p?p.id:null;
  $("#pfTitle").textContent=p?"Modifier « "+p.nom+" »":TYPES[type].New;
  const v=p?{nom:p.nom,desc:p.description,prot:p.proteines,lip:p.lipides,gluc:p.glucides,kcal:p.kcal,prix:p.prix}:{};
  F.forEach(k=>{const x=v[k];$("#p-"+k).value=(x===undefined||x===null)?"":String(x);});
  $("#catWrap").hidden=type!=="plat";$("#p-cat").value=(p&&p.categorie)||"";
  $("#pErr").textContent="";$("#prodDlg").showModal();
}
$("#pCancel").addEventListener("click",()=>$("#prodDlg").close());
$("#calc").addEventListener("click",()=>{$("#p-kcal").value=Math.round(num($("#p-prot").value)*4+num($("#p-lip").value)*9+num($("#p-gluc").value)*4);});
$("#prodForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const nom=$("#p-nom").value.trim(),prix=$("#p-prix").value.trim();
  if(!nom||!prix){$("#pErr").textContent="Le nom et le prix de vente sont obligatoires.";return;}
  const row={categorie:S.editType==="plat"?($("#p-cat").value||null):null,nom,description:$("#p-desc").value.trim(),proteines:num($("#p-prot").value),lipides:num($("#p-lip").value),glucides:num($("#p-gluc").value),kcal:Math.round(num($("#p-kcal").value)),prix:num(prix)};
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
    <div class="o-actions"><button class="btn sm ghost" type="button" data-releve="${esc(c.id)}">Relevé mensuel</button>${c.optin_fetes?`<button class="btn sm ghost" type="button" data-optout="${esc(c.id)}">Retirer l'accord mails fêtes</button>`:""}</div>
  </article>`;}).join("");
}
async function onClientAction(e){
  const rl=e.target.closest("[data-releve]");
  if(rl){S.relClient=rl.dataset.releve;S.tab="releves";buildTab();window.scrollTo({top:0});return;}
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



/* ========== RELEVÉS MENSUELS ========== */
const CFG=window.SUCCOMBE_CONFIG||{};
const TVA=Object.assign({plat:10,gateau:5.5},CFG.TVA||{});
const SOC=CFG.SOCIETE||{};
const r2=n=>Math.round(n*100)/100;
const monthLabel=m=>{const[y,mo]=m.split("-").map(Number);const t=new Date(y,mo-1,1).toLocaleDateString("fr-FR",{month:"long",year:"numeric"});return t.charAt(0).toUpperCase()+t.slice(1);};
function buildReleves(){
  const now=new Date();const opts=[];
  for(let i=0;i<13;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);opts.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));}
  if(!S.relMonth)S.relMonth=opts[1];
  $("#cBody").innerHTML=`<div class="toolbar"><div style="flex:0 1 240px"><label for="relMonth">Mois</label><select id="relMonth">${opts.map(m=>`<option value="${m}" ${m===S.relMonth?"selected":""}>${monthLabel(m)}</option>`).join("")}</select></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost sm" type="button" id="relCsv">Export détaillé (CSV)</button><button class="btn sm" type="button" id="relPrintAll">Imprimer tous les relevés</button></div></div>
    <p class="small muted" style="margin:4px 0 0">Récapitulatif des commandes livrées, par client, pour vous aider à saisir les factures dans votre logiciel de facturation. TVA : ${String(TVA.plat).replace(".",",")} % sur les plats, ${String(TVA.gateau).replace(".",",")} % sur les gâteaux (réglable dans config.js, à valider avec votre comptable).</p>
    <div id="relTot"></div><div id="relList"><p class="muted">Chargement…</p></div>`;
  $("#relMonth").addEventListener("change",e=>{S.relMonth=e.target.value;loadReleves();});
  $("#relTot").addEventListener("click",e=>{if(e.target.closest("#relAll")){S.relClient=null;renderReleves();}});
  $("#relCsv").addEventListener("click",exportReleves);
  $("#relPrintAll").addEventListener("click",()=>printReleves(relShown()));
  $("#relList").addEventListener("click",e=>{const b=e.target.closest("[data-print]");if(b)printReleves((S.releves||[]).filter(r=>r.key===b.dataset.print));
    const t=e.target.closest("[data-toggle]");if(t){const d=document.getElementById("rd-"+t.dataset.toggle);if(d){d.hidden=!d.hidden;t.textContent=d.hidden?"Voir le détail":"Masquer le détail";}}});
  loadReleves();
}
async function loadReleves(){
  const[y,m]=S.relMonth.split("-").map(Number);
  const a=S.relMonth+"-01",b=ymdOf(new Date(y,m,0));
  let orders,clients;
  try{
    [orders,clients]=await Promise.all([
      fetchAll(()=>sb.from("commandes").select("id,jour,creneau,prenom,nom,tel,email,adresse,cp,ville,lignes,total,client_id").eq("statut","livree").gte("jour",a).lte("jour",b).order("jour").order("created_at")),
      fetchAll(()=>sb.from("clients").select("id,prenom,nom,tel,email,adresse,cp,ville"))]);
  }catch(err){if(authErr(err))return showLogin("Session expirée, reconnectez-vous.");$("#relList").innerHTML=`<div class="empty"><p>Les relevés n'ont pas pu être préparés.</p></div>`;return;}
  if(S.tab!=="releves")return;
  const cmap=new Map(clients.map(c=>[c.id,c]));const groups=new Map();
  orders.forEach(o=>{
    const key=o.client_id||("tel-"+String(o.tel||"").replace(/\D/g,""));
    if(!groups.has(key)){const c=cmap.get(o.client_id)||o;groups.set(key,{key,client:{prenom:c.prenom,nom:c.nom,tel:c.tel,email:c.email,adresse:c.adresse,cp:c.cp,ville:c.ville},lignes:[],nb:0});}
    const g=groups.get(key);g.nb++;
    (o.lignes||[]).forEach(l=>{const type=l.type==="gateau"?"gateau":"plat";const taux=num(TVA[type]);
      const ttc=r2(num(l.qty)*num(l.prix));const ht=r2(ttc/(1+taux/100));
      g.lignes.push({jour:o.jour,nom:l.nom,type,qty:num(l.qty),pu:num(l.prix),taux,ttc,ht,tva:r2(ttc-ht)});});
  });
  S.releves=[...groups.values()].map(g=>{const t={ht:0,tva:0,ttc:0,parTaux:{}};g.lignes.forEach(l=>{t.ht+=l.ht;t.tva+=l.tva;t.ttc+=l.ttc;const k=l.taux;t.parTaux[k]=t.parTaux[k]||{ht:0,tva:0};t.parTaux[k].ht+=l.ht;t.parTaux[k].tva+=l.tva;});
    t.ht=r2(t.ht);t.tva=r2(t.tva);t.ttc=r2(t.ttc);return Object.assign(g,{tot:t});})
    .sort((x,y)=>(x.client.nom||"").localeCompare(y.client.nom||"","fr")||(x.client.prenom||"").localeCompare(y.client.prenom||"","fr"));
  renderReleves();
}
function ymdOf(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
const pct=t=>String(t).replace(".",",")+" %";
function lignesTable(r,foot){
  return `<div class="tablewrap"><table class="rel-table"><thead><tr><th>Date</th><th>Article</th><th class="r">Qté</th><th class="r">PU TTC</th><th class="r">TVA</th><th class="r">HT</th><th class="r">TTC</th></tr></thead><tbody>
    ${r.lignes.map(l=>`<tr><td>${esc(l.jour.split("-").reverse().join("/"))}</td><td>${esc(l.nom)}</td><td class="r">${l.qty}</td><td class="r">${eur(l.pu)}</td><td class="r">${pct(l.taux)}</td><td class="r">${eur(l.ht)}</td><td class="r">${eur(l.ttc)}</td></tr>`).join("")}</tbody>
    ${foot?`<tfoot>${Object.entries(r.tot.parTaux).map(([t,v])=>`<tr><td colspan="5" class="r">Base HT à ${pct(t)} / TVA</td><td class="r">${eur(r2(v.ht))}</td><td class="r">${eur(r2(v.tva))}</td></tr>`).join("")}
      <tr><td colspan="5" class="r">Total</td><td class="r">${eur(r.tot.ht)} HT</td><td class="r">${eur(r.tot.ttc)} TTC</td></tr></tfoot>`:""}</table></div>`;
}
function renderReleves(){
  const el=$("#relList");if(!el)return;
  const one=S.relClient?(S.releves||[]).filter(r=>r.key===S.relClient):null;
  const R=one||S.releves||[];
  if(one){
    const c=(S.clients||[]).find(x=>x.id===S.relClient);const nom=c?`${c.prenom} ${c.nom}`:"ce client";
    $("#relTot").innerHTML=`<div class="notice" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><span>Relevé de <b>${esc(nom)}</b> pour ${esc(monthLabel(S.relMonth).toLowerCase())}</span><button class="linkbtn" type="button" id="relAll">Voir tous les clients</button></div>`;
    $("#relPrintAll").textContent="Imprimer le relevé";$("#relPrintAll").disabled=!R.length;$("#relCsv").disabled=!R.length;
    if(!R.length){el.innerHTML=`<div class="empty"><p>Aucune commande livrée pour ${esc(nom)} en ${esc(monthLabel(S.relMonth).toLowerCase())}.</p><p class="small">Changez de mois, ou vérifiez que ses commandes sont au statut « Livrée ».</p></div>`;return;}
  }else if($("#relPrintAll"))$("#relPrintAll").textContent="Imprimer tous les relevés";
  const T=R.reduce((a,r)=>({ht:a.ht+r.tot.ht,tva:a.tva+r.tot.tva,ttc:a.ttc+r.tot.ttc}),{ht:0,tva:0,ttc:0});
  if(!one)$("#relTot").innerHTML=R.length?`<div class="prod"><h3 style="margin-top:0">${esc(monthLabel(S.relMonth))} : ${R.length} client${R.length>1?"s":""}</h3>
    <div><span>Total HT</span><b>${eur(r2(T.ht))}</b></div><div><span>TVA</span><b>${eur(r2(T.tva))}</b></div><div><span>Total TTC</span><b>${eur(r2(T.ttc))}</b></div></div>`:"";
  $("#relPrintAll").disabled=!R.length;$("#relCsv").disabled=!R.length;
  if(!R.length){el.innerHTML=`<div class="empty"><p>Aucune commande livrée en ${esc(monthLabel(S.relMonth).toLowerCase())}.</p><p class="small">Seules les commandes au statut « Livrée » sont reprises.</p></div>`;return;}
  el.innerHTML=R.map(r=>{const c=r.client;const id=r.key.replace(/[^a-zA-Z0-9-]/g,"");return `<article class="order">
    <div class="o-head"><div><div class="o-name">${esc(c.prenom)} ${esc(c.nom)}</div><div class="o-meta">${r.nb} commande${r.nb>1?"s":""} livrée${r.nb>1?"s":""}${c.email?" · "+esc(c.email):""}</div></div><b style="font-variant-numeric:tabular-nums">${eur(r.tot.ttc)}</b></div>
    <div class="rel-sum"><span>HT <b>${eur(r.tot.ht)}</b></span><span>TVA <b>${eur(r.tot.tva)}</b></span><span>TTC <b>${eur(r.tot.ttc)}</b></span></div>
    <div id="rd-${id}" hidden>${lignesTable(r,true)}</div>
    <div class="o-actions"><button class="btn sm ghost" type="button" data-toggle="${id}">Voir le détail</button><button class="btn sm ghost" type="button" data-print="${esc(r.key)}">Imprimer / PDF</button></div></article>`;}).join("");
}
function releveHTML(r,today_){const c=r.client;return `<section class="rel-doc">
    <div class="hd"><div><b>${esc(SOC.nom||"Succombe")}</b><br>${esc(SOC.adresse||"")}${SOC.siret?"<br>SIRET "+esc(SOC.siret):""}${SOC.tva_intra?"<br>TVA "+esc(SOC.tva_intra):""}</div>
      <div style="text-align:right"><b>${esc(c.prenom)} ${esc(c.nom)}</b><br>${esc(c.adresse||"")}<br>${esc([c.cp,c.ville].filter(Boolean).join(" "))}${c.email?"<br>"+esc(c.email):""}${c.tel?"<br>"+esc(c.tel):""}</div></div>
    <h1>Relevé de commandes – ${esc(monthLabel(S.relMonth))}</h1>
    <p>${r.nb} commande${r.nb>1?"s":""} livrée${r.nb>1?"s":""} · édité le ${today_}</p>
    ${lignesTable(r,true)}
    <p class="note">Document récapitulatif établi pour faciliter la facturation. Ne vaut pas facture.</p></section>`;}
const PRINT_CSS=`*{box-sizing:border-box}body{margin:0;padding:24px;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;color:#241A12;background:#fff}
.bar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;max-width:800px;margin:0 auto 20px;padding:12px 16px;background:#F5ECDB;border-radius:6px}
.bar button{border:0;background:#241A12;color:#FCF8EE;border-radius:999px;padding:10px 20px;font:inherit;font-weight:600;cursor:pointer}
.rel-doc{max-width:800px;margin:0 auto 40px}
.rel-doc h1{font-family:Fraunces,Georgia,serif;font-weight:500;font-size:26px;margin:0 0 6px}
.hd{display:flex;justify-content:space-between;gap:30px;margin-bottom:28px;line-height:1.45}
table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:6px 6px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
th{font-size:11px;color:#6E5D49;font-weight:600}.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
tfoot td{font-weight:700;border-bottom:0}.note{font-size:11px;color:#6E5D49;margin-top:24px}.tablewrap{overflow-x:auto}
@media print{@page{margin:14mm}body{padding:0}.bar{display:none}.rel-doc{margin:0;max-width:none;page-break-after:always}.rel-doc:last-child{page-break-after:auto}}`;
function printReleves(list){
  if(!list.length)return;
  const today_=new Date().toLocaleDateString("fr-FR");
  const titre=list.length===1?`Relevé ${list[0].client.prenom} ${list[0].client.nom} – ${monthLabel(S.relMonth)}`:`Relevés – ${monthLabel(S.relMonth)}`;
  const doc=`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titre)}</title>
    <style>${PRINT_CSS}</style></head><body>
    <div class="bar"><span>${list.length} relevé${list.length>1?"s":""} prêt${list.length>1?"s":""}. Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF ».</span><button type="button" onclick="window.print()">Imprimer / PDF</button></div>
    ${list.map(r=>releveHTML(r,today_)).join("")}
    <script>(function(){var done=false;function go(){if(done)return;done=true;window.__impression=true;setTimeout(function(){window.print();},250);}
      window.__polices=function(){if(document.fonts&&document.fonts.ready){document.fonts.ready.then(go,go);}else{go();}};setTimeout(go,2000);})();<\/script>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500&family=Inter:wght@400;600;700&display=swap" rel="stylesheet" onload="window.__polices()" onerror="window.__polices()">
    </body></html>`;
  const w=window.open("","_blank");
  if(w){w.document.open();w.document.write(doc);w.document.close();return;}
  // fenêtre bloquée : téléchargement du relevé, à ouvrir puis imprimer
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([doc],{type:"text/html;charset=utf-8"}));
  a.download=(titre.replace(/[^\wÀ-ÿ –-]/g,"").trim()||"releve")+".html";document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  toast("Fenêtre bloquée : le relevé a été téléchargé, ouvrez-le pour l'imprimer");
}
function relShown(){const R=S.releves||[];return S.relClient?R.filter(r=>r.key===S.relClient):R;}
function exportReleves(){
  const R=relShown();if(!R.length)return;
  const cell=v=>{const s=String(v==null?"":v);return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const n2=v=>num(v).toFixed(2).replace(".",",");
  const head=["Client","Téléphone","E-mail","Adresse","Code postal","Ville","Date","Article","Type","Quantité","PU TTC","Taux TVA","Montant HT","TVA","Montant TTC"];
  const rows=[];R.forEach(r=>{const c=r.client;r.lignes.forEach(l=>rows.push([`${c.prenom} ${c.nom}`,c.tel,c.email,c.adresse,c.cp,c.ville,l.jour.split("-").reverse().join("/"),l.nom,l.type==="gateau"?"Gâteau":"Plat",l.qty,n2(l.pu),String(l.taux).replace(".",","),n2(l.ht),n2(l.tva),n2(l.ttc)]));});
  const csv="\ufeff"+[head].concat(rows).map(r=>r.map(cell).join(";")).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  a.download=`succombe-releves-${S.relMonth}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}

/* ========== ÉQUIPE ========== */
function buildEquipe(){
  $("#cBody").innerHTML=`<form class="formcard" id="invForm" novalidate>
      <h3 style="margin-top:0">Donner accès à l'espace cuisine</h3>
      <div class="inline"><div><label for="invEmail">E-mail de la personne</label><input id="invEmail" type="email" autocomplete="off" required></div>
        <button class="btn accent" type="submit" id="invBtn">Créer l'accès</button></div>
      <div class="err" id="invErr"></div></form>
    <div id="invRes"></div>
    <h2>L'équipe</h2><div id="eqList"><p class="muted">Chargement…</p></div>`;
  $("#invForm").addEventListener("submit",e=>{e.preventDefault();invite($("#invEmail").value);});
  $("#eqList").addEventListener("click",onEquipeAction);
  $("#invRes").addEventListener("click",e=>{if(e.target.closest("#copyMsg"))copy($("#invMsg").textContent);});
  loadEquipe();
}
async function loadEquipe(){
  const {data,error}=await sb.rpc("equipe");
  const el=$("#eqList");if(!el)return;
  if(error){el.innerHTML=`<div class="empty"><p>La liste n'a pas pu être chargée.</p><p class="small">Vérifiez que la mise à jour SQL v3 a bien été exécutée dans Supabase.</p></div>`;return;}
  const dt=d=>d?new Date(d).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"}):"jamais";
  el.innerHTML=(data||[]).map(m=>`<article class="order"><div class="o-head"><div><div class="o-name" style="font-size:19px;overflow-wrap:anywhere">${esc(m.email)}</div>
      <div class="o-meta">Dernière connexion : ${esc(dt(m.last_sign_in_at))}</div></div>${m.moi?'<span class="pill">Vous</span>':""}</div>
      ${m.moi?"":`<div class="o-actions"><button class="btn sm ghost" type="button" data-reset="${esc(m.email)}">Nouveau mot de passe provisoire</button><button class="btn sm ghost" type="button" data-remove="${esc(m.user_id)}" data-email="${esc(m.email)}">Retirer l'accès</button></div>`}
    </article>`).join("");
}
async function invite(email,isReset){
  email=String(email||"").trim();
  const err=$("#invErr");if(err)err.textContent="";
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){if(err)err.textContent="Saisissez une adresse e-mail valide.";return;}
  const btn=$("#invBtn");if(btn)btn.disabled=true;
  const {data,error}=await sb.functions.invoke("inviter-cuisine",{body:{email}});
  if(btn)btn.disabled=false;
  if(error){
    let msg="L'accès n'a pas pu être créé. Réessayez.";
    try{const r=error.context;if(r&&r.status===404)msg="La fonction « inviter-cuisine » est introuvable : vérifiez qu'elle est déployée dans Supabase.";else{const j=await r.json();if(j&&j.error)msg=j.error;}}catch(e){}
    if(err)err.textContent=msg;else toast(msg);return;
  }
  const lien=location.origin+"/cuisine";
  const msg=`Bonjour, voici ton accès à l'espace cuisine Succombe.\nAdresse : ${lien}\nE-mail : ${data.email}\nMot de passe provisoire : ${data.password}\nTu choisiras ton propre mot de passe à la première connexion.`;
  $("#invRes").innerHTML=`<div class="formcard" style="border-color:var(--accent)">
    <h3 style="margin-top:0">${data.existant?"Nouveau mot de passe provisoire":"Accès créé"} pour ${esc(data.email)}</h3>
    <p class="small muted" style="margin-top:0">Transmettez ce message à la personne. Le mot de passe provisoire ne sera plus affiché ensuite.</p>
    <div class="o-note" id="invMsg" style="white-space:pre-line;overflow-wrap:anywhere">${esc(msg)}</div>
    <div class="row" style="justify-content:flex-start"><button class="btn sm" type="button" id="copyMsg">Copier le message</button></div></div>`;
  if($("#invEmail"))$("#invEmail").value="";
  $("#invRes").scrollIntoView({behavior:"smooth",block:"nearest"});
  loadEquipe();
}
async function onEquipeAction(e){
  const r=e.target.closest("[data-reset]");
  if(r){if(!confirm("Générer un nouveau mot de passe provisoire pour "+r.dataset.reset+" ? L'ancien ne fonctionnera plus."))return;r.disabled=true;await invite(r.dataset.reset,true);r.disabled=false;return;}
  const d=e.target.closest("[data-remove]");
  if(d){if(!confirm("Retirer l'accès de "+d.dataset.email+" à l'espace cuisine ?"))return;d.disabled=true;
    const {error}=await sb.rpc("retirer_acces",{p_user:d.dataset.remove});
    if(error){d.disabled=false;toast(error.message&&/^[A-ZÉ]/.test(error.message)?error.message:"Le retrait a échoué");return;}
    toast("Accès retiré");loadEquipe();}
}
async function copy(text){
  try{await navigator.clipboard.writeText(text);toast("Message copié");}
  catch(e){const t=document.createElement("textarea");t.value=text;document.body.appendChild(t);t.select();try{document.execCommand("copy");toast("Message copié");}catch(_){toast("Copie impossible, sélectionnez le texte");}t.remove();}
}

if(!sb)$("#view").innerHTML=`<div class="empty" style="margin-top:28px"><p>Configuration manquante.</p><p class="small">Renseignez l'URL et la clé Supabase dans config.js.</p></div>`;
else start();
})();
