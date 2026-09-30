-- =========================================================
-- Succombe – commandes de plats livrés
-- À coller dans Supabase > SQL Editor, puis "Run".
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Administrateurs (restaurateur) ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admin se lit" on public.admins;
create policy "admin se lit" on public.admins for select using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Plats (la carte, jour par jour) ----------
create table if not exists public.plats (
  id          uuid primary key default gen_random_uuid(),
  jour        date not null,
  nom         text not null check (char_length(nom) between 1 and 120),
  description text not null default '' check (char_length(description) <= 600),
  proteines   numeric(6,1) not null default 0 check (proteines >= 0),
  lipides     numeric(6,1) not null default 0 check (lipides >= 0),
  glucides    numeric(6,1) not null default 0 check (glucides >= 0),
  kcal        numeric(7,0) not null default 0 check (kcal >= 0),
  prix        numeric(8,2) not null check (prix >= 0),
  epuise      boolean not null default false,
  ordre       int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists plats_jour_idx on public.plats (jour);
alter table public.plats enable row level security;

drop policy if exists "carte publique" on public.plats;
drop policy if exists "admin gere la carte" on public.plats;
create policy "carte publique" on public.plats for select using (true);
create policy "admin gere la carte" on public.plats for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Commandes ----------
create table if not exists public.commandes (
  id         uuid primary key default gen_random_uuid(),
  token      uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  jour       date not null,
  creneau    text not null,
  statut     text not null default 'nouvelle'
             check (statut in ('nouvelle','preparation','livraison','livree','annulee')),
  prenom     text not null,
  nom        text not null,
  tel        text not null,
  email      text,
  adresse    text not null,
  cp         text not null,
  ville      text not null,
  note       text,
  lignes     jsonb not null,
  total      numeric(8,2) not null
);
create index if not exists commandes_jour_idx on public.commandes (jour);
create unique index if not exists commandes_token_idx on public.commandes (token);
alter table public.commandes enable row level security;

-- Seul le restaurateur lit et modifie les commandes.
-- Les clients ne passent JAMAIS par la table : uniquement par les fonctions ci-dessous.
drop policy if exists "admin lit commandes" on public.commandes;
drop policy if exists "admin modifie commandes" on public.commandes;
create policy "admin lit commandes" on public.commandes for select using (public.is_admin());
create policy "admin modifie commandes" on public.commandes for update
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists commandes_touch on public.commandes;
create trigger commandes_touch before update on public.commandes
  for each row execute function public.touch_updated_at();

-- ---------- Passer une commande (client, sans compte) ----------
-- Les prix et les macros sont relus en base : le client ne peut pas les modifier.
create or replace function public.passer_commande(
  p_jour date, p_creneau text, p_client jsonb, p_note text, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_total  numeric := 0;
  v_lignes jsonb := '[]'::jsonb;
  v_item   jsonb;
  v_qty    int;
  v_plat   public.plats%rowtype;
  v_id     uuid;
  v_token  uuid;
begin
  if p_jour is null or p_jour < (now() at time zone 'Europe/Paris')::date then
    raise exception 'Ce jour n''est plus disponible à la commande.';
  end if;
  if coalesce(trim(p_client->>'prenom'),'') = '' or coalesce(trim(p_client->>'nom'),'') = ''
     or coalesce(trim(p_client->>'tel'),'') = '' or coalesce(trim(p_client->>'adresse'),'') = ''
     or coalesce(trim(p_client->>'cp'),'') = '' or coalesce(trim(p_client->>'ville'),'') = '' then
    raise exception 'Coordonnées incomplètes.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'Panier invalide.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := nullif(v_item->>'qty','')::int;
    if v_qty is null or v_qty < 1 or v_qty > 20 then
      raise exception 'Quantité invalide.';
    end if;
    select * into v_plat from public.plats
      where id = (v_item->>'plat_id')::uuid and jour = p_jour and not epuise;
    if not found then
      raise exception 'Un plat de votre panier n''est plus disponible.';
    end if;
    v_lignes := v_lignes || jsonb_build_array(jsonb_build_object(
      'plat_id', v_plat.id, 'nom', v_plat.nom, 'qty', v_qty, 'prix', v_plat.prix,
      'proteines', v_plat.proteines, 'lipides', v_plat.lipides,
      'glucides', v_plat.glucides, 'kcal', v_plat.kcal));
    v_total := v_total + v_qty * v_plat.prix;
  end loop;

  insert into public.commandes (jour, creneau, prenom, nom, tel, email, adresse, cp, ville, note, lignes, total)
  values (p_jour, left(coalesce(p_creneau,''),60),
          left(trim(p_client->>'prenom'),80), left(trim(p_client->>'nom'),80),
          left(trim(p_client->>'tel'),30), left(nullif(trim(p_client->>'email'),''),120),
          left(trim(p_client->>'adresse'),200), left(trim(p_client->>'cp'),10),
          left(trim(p_client->>'ville'),80), left(nullif(trim(coalesce(p_note,'')),''),600),
          v_lignes, v_total)
  returning id, token into v_id, v_token;

  return jsonb_build_object('id', v_id, 'token', v_token, 'total', v_total);
end; $$;
grant execute on function public.passer_commande(date, text, jsonb, text, jsonb) to anon, authenticated;

-- ---------- Suivi des commandes (client) ----------
-- Le client ne voit que les commandes dont il détient le jeton (gardé dans son navigateur).
create or replace function public.suivre_commandes(p_tokens uuid[])
returns table (id uuid, jour date, creneau text, statut text, lignes jsonb, total numeric, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.jour, c.creneau, c.statut, c.lignes, c.total, c.created_at
  from public.commandes c
  where c.token = any (p_tokens[1:30])
  order by c.created_at desc;
$$;
grant execute on function public.suivre_commandes(uuid[]) to anon, authenticated;

-- ---------- Temps réel ----------
do $$ begin
  begin alter publication supabase_realtime add table public.plats;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.commandes; exception when duplicate_object then null; end;
end $$;

-- =========================================================
-- APRÈS avoir créé le compte du restaurateur (Authentication > Users > Add user),
-- exécuter la ligne suivante en remplaçant l'e-mail :
--
-- insert into public.admins (user_id) select id from auth.users where email = 'restaurateur@exemple.fr';
-- =========================================================
