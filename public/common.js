(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const z=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate());
const parse=s=>{const[a,b,c]=s.split("-").map(Number);return new Date(a,b-1,c);};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return ymd(d);};
const today=()=>ymd(new Date());
const eur=n=>(Number(n)||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
const num=v=>{const n=parseFloat(String(v==null?"":v).replace(",","."));return isFinite(n)?n:0;};
const fmt=n=>(Math.round(num(n)*10)/10).toLocaleString("fr-FR");
const dayShort=s=>parse(s).toLocaleDateString("fr-FR",{weekday:"short"}).replace(".","");
const dayLong=s=>parse(s).toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
const timeOf=t=>new Date(t).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
const CATEGORIES={poisson:"Poisson",poulet:"Poulet",boeuf:"Bœuf",vegetarien:"Végétarien"};
const STATUS={nouvelle:"Nouvelle",preparation:"En préparation",livraison:"En livraison",livree:"Livrée",annulee:"Annulée"};
let toastT;
function toast(msg){const t=$("#toast");if(!t)return;t.textContent=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),2800);}
function macroBlock(p){
  const pk=num(p.proteines)*4,lk=num(p.lipides)*9,gk=num(p.glucides)*4,t=pk+lk+gk||1;
  return `<div class="macros">
    <div class="m p"><b>${fmt(p.proteines)} g</b><span>Protéines</span></div>
    <div class="m l"><b>${fmt(p.lipides)} g</b><span>Lipides</span></div>
    <div class="m g"><b>${fmt(p.glucides)} g</b><span>Glucides</span></div>
    <div class="m"><b>${fmt(p.kcal)}</b><span>kcal</span></div></div>
    <div class="ribbon" aria-hidden="true"><i class="p" style="width:${pk/t*100}%"></i><i class="l" style="width:${lk/t*100}%"></i><i class="g" style="width:${gk/t*100}%"></i></div>`;
}
function makeClient(){
  const c=window.SUCCOMBE_CONFIG||{};
  if(!window.supabase||!c.SUPABASE_URL||c.SUPABASE_URL.includes("VOTRE-PROJET"))return null;
  return window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY);
}
window.SC={CATEGORIES,$,esc,ymd,parse,addDays,today,eur,num,fmt,dayShort,dayLong,timeOf,STATUS,toast,macroBlock,makeClient};
})();
