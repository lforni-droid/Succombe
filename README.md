# Succombe – commandes de plats livrés

Deux pages statiques (HTML/JS, sans build) branchées sur Supabase :

- `/` : les clients voient la carte des 7 prochains jours (protéines, lipides, glucides, kcal, prix), commandent et suivent leurs commandes. Pas de compte client.
- `/cuisine` : le restaurateur se connecte, reçoit les commandes en temps réel (avec signal sonore), fait avancer leur statut et gère la carte jour par jour.

## 1. Supabase

1. Créer un projet sur supabase.com.
2. **SQL Editor** : coller le contenu de `supabase/schema.sql`, puis *Run*.
3. **Authentication > Users > Add user** : créer le compte du restaurateur (e-mail + mot de passe, cocher *Auto confirm*).
4. Dans le SQL Editor, déclarer ce compte comme restaurateur :
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'restaurateur@exemple.fr';
   ```
5. **Authentication > Sign In / Providers** : désactiver *Allow new users to sign up*.
6. **Project Settings > API** : copier la *Project URL* et la clé *anon public*.

## 2. Configuration

Dans `public/config.js`, renseigner `SUPABASE_URL` et `SUPABASE_ANON_KEY`. Les créneaux de livraison se modifient au même endroit.
La clé *anon* est publique par conception : la sécurité repose sur les règles RLS (les clients ne lisent jamais les commandes des autres, et les prix sont recalculés côté base).

## 3. GitHub

```bash
git init && git add . && git commit -m "Succombe – commandes"
git branch -M main
git remote add origin https://github.com/<compte>/succombe-commandes.git
git push -u origin main
```

## 4. Netlify

*Add new site > Import an existing project > GitHub*, choisir le dépôt. Pas de commande de build ; le dossier publié (`public`) est déjà défini dans `netlify.toml`.

Ensuite : `https://<site>.netlify.app/` pour les clients, `https://<site>.netlify.app/cuisine` pour le restaurateur.
