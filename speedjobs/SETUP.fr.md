# Guide d'installation SpeedJob's (pas-à-pas)

Compte à créer / outils nécessaires :
- Compte **Supabase** (gratuit) — base de données + auth SMS + temps réel
- Compte **Stripe** (gratuit) — paiements
- Compte **Firebase** (gratuit) — notifs push
- Compte **Vercel** (gratuit) — hébergement
- Compte **GitHub** — déjà OK (tu lis ce fichier dedans)
- **Node.js 18+** installé en local (pour tester avant de déployer)

Temps total estimé : 45–60 min.

---

## 1) Supabase — la base de données et l'auth

### 1.1 Créer le projet
1. Va sur https://supabase.com → **Start your project** → connecte-toi avec GitHub.
2. **New project**. Donne-lui un nom (`speedjobs-prod`), région **Europe (eu-central-1)** ou **eu-west-1**, génère un mot de passe et garde-le.
3. Attends 2 minutes que le projet soit prêt.

### 1.2 Récupérer les clés
- Menu de gauche → **Project Settings → API**.
- Note quelque part :
  - `Project URL` → c'est `NEXT_PUBLIC_SUPABASE_URL`
  - `anon` `public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` `secret` → `SUPABASE_SERVICE_ROLE_KEY` (à ne JAMAIS exposer côté client)

### 1.3 Appliquer le schéma SQL
- Menu de gauche → **SQL Editor → New query**.
- Copie le contenu de `speedjobs/supabase/migrations/0001_init.sql` et clique **Run**.
- Tu dois voir « Success ». Cela crée toutes les tables, les RLS, les triggers de notation, le bucket `candidate-photos`, et active le Realtime sur `jobs` et `applications`.

### 1.4 Activer l'auth SMS (Twilio)
1. Va sur https://www.twilio.com → crée un compte (carte de crédit demandée, ~50 CHF de crédit offert au début).
2. Twilio Console → **Develop → Messaging → Try it out → Get set up** → achète/active un numéro de téléphone (≈ 1 CHF/mois).
3. Récupère **Account SID** + **Auth Token** + **Messaging Service SID** (ou le numéro acheté).
4. Retour Supabase → **Authentication → Providers → Phone** → active **Twilio** et colle les 3 valeurs.
5. **Authentication → URL Configuration** : ajoute `http://localhost:3000` et plus tard l'URL Vercel.

> Astuce : tant que tu n'as pas configuré Twilio, les SMS ne partent pas. Pour tester sans SMS, tu peux activer le provider « SMS Test OTP » en mode dev qui accepte le code `123456` pour des numéros prédéfinis.

---

## 2) Stripe — l'abonnement employeur

### 2.1 Créer les produits
1. Va sur https://dashboard.stripe.com → reste en **Test mode** (toggle en haut à droite).
2. **Products → + Add product** :
   - **Starter** — prix récurrent **19 CHF / month** → crée → copie le **Price ID** (commence par `price_...`).
   - Recommence pour **Pro** — **49 CHF / month**.
   - Recommence pour **Business** — **99 CHF / month**.

### 2.2 Clés API
- **Developers → API keys** :
  - `Publishable key` → `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` (et `STRIPE_PUBLIC_KEY`)
  - `Secret key` → `STRIPE_SECRET_KEY`

### 2.3 Webhook
- **Developers → Webhooks → + Add endpoint**.
- URL : `https://<ton-domaine-vercel>/api/stripe/webhook` (tu reviendras coller l'URL après le déploiement Vercel — pour le moment, mets `https://example.com/api/stripe/webhook`).
- Events à cocher :
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `customer.subscription.deleted`
- Une fois créé, **Reveal signing secret** (commence par `whsec_...`) → `STRIPE_WEBHOOK_SECRET`.

---

## 3) Firebase Cloud Messaging — les notifs push

### 3.1 Créer le projet Firebase
1. https://console.firebase.google.com → **Add project** → nom `speedjobs`. Désactive Google Analytics (pas nécessaire).
2. Une fois créé : **Project settings (l'engrenage) → General** :
   - Onglet **Your apps → Add app → Web (`</>`)** → nom `speedjobs-web`, ignore Hosting.
   - Stripe te montre un objet `firebaseConfig`. Copie chaque valeur :
     - `apiKey` → `NEXT_PUBLIC_FIREBASE_API_KEY`
     - `authDomain` → `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
     - `projectId` → `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
     - `storageBucket` → `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
     - `messagingSenderId` → `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
     - `appId` → `NEXT_PUBLIC_FIREBASE_APP_ID`

### 3.2 Activer Cloud Messaging et clé VAPID
1. **Project settings → Cloud Messaging**.
2. Tout en bas, section **Web configuration → Web Push certificates** → **Generate key pair**.
3. Copie la clé → `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.

### 3.3 Service account (côté serveur)
1. **Project settings → Service accounts → Generate new private key**.
2. Un fichier JSON est téléchargé.
3. Tu dois **minifier ce JSON sur une seule ligne** et le coller dans `FIREBASE_SERVICE_ACCOUNT`.
   - En CLI : `cat firebase-adminsdk.json | tr -d '\n' | tr -s ' '` puis copie-colle.
   - Ou en ligne : https://jsonformatter.org/json-minify

---

## 4) Variables d'environnement locales

Dans `speedjobs/` :

```bash
cp .env.local.example .env.local
```

Édite `.env.local` et colle TOUTES les valeurs collectées ci-dessus. Mets aussi :

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=$(openssl rand -hex 32)
```

---

## 5) Lancer en local

```bash
cd speedjobs
npm install
npm run dev
```

Ouvre http://localhost:3000.

**Test du flow** :
- Clique « Je cherche du travail » → entre ton numéro (`+41...`) → tape le code SMS reçu → remplis le profil → tu arrives sur l'écran ONLINE.
- Sur un autre navigateur (incognito), refais avec un autre numéro et choisis « Je cherche des employés » → choisis Starter → tu seras redirigé vers Stripe Checkout (mode test → numéro de carte `4242 4242 4242 4242`, n'importe quelle date future, n'importe quel CVC).
- De retour sur le dashboard employeur → **+ Créer une urgence**. Coche un métier identique aux skills du candidat, même lieu. Publie.
- Le candidat reçoit la notif (toast ou push si le navigateur l'a autorisé), clique → **ACCEPTER MAINTENANT**.
- L'employeur voit le candidat apparaître **live** → **Confirmer**.

---

## 6) Déployer sur Vercel

### 6.1 Push GitHub
Tes commits sont déjà sur la branche `claude/speedjobs-complete-app-RQElb`. Sur GitHub, ouvre une PR vers `main` et merge (ou laisse la branche, Vercel peut déployer depuis n'importe quelle branche).

### 6.2 Importer dans Vercel
1. https://vercel.com → **Add New → Project** → importe ton repo GitHub.
2. **Configure project** :
   - **Framework Preset** : Next.js (auto-détecté).
   - **Root Directory** : `speedjobs` ← **TRÈS IMPORTANT** car ton repo a deux projets.
3. **Environment Variables** : copie/colle CHAQUE ligne de ton `.env.local`. (Pour `FIREBASE_SERVICE_ACCOUNT`, colle le JSON minifié sur une ligne).
4. Clique **Deploy**. ~2 min plus tard, tu as une URL `https://speedjobs-xxx.vercel.app`.

### 6.3 Finaliser les URLs
1. **Vercel → ton projet → Settings → Environment Variables** : remplace `NEXT_PUBLIC_APP_URL` par `https://<ton-domaine-vercel>` puis **Redeploy**.
2. **Stripe → Webhooks** : édite l'endpoint et mets la vraie URL `https://<ton-domaine-vercel>/api/stripe/webhook`.
3. **Supabase → Authentication → URL Configuration** : ajoute `https://<ton-domaine-vercel>` aux Redirect URLs.

### 6.4 Vérifier le cron
Vercel détecte automatiquement `vercel.json` et programme la tâche `/api/cron/expire-jobs` toutes les 2 minutes. Vérifie dans **Vercel → ton projet → Cron Jobs**.

---

## 7) Passer en production réelle

Quand tu es prêt à facturer pour de vrai :
1. **Stripe** : bascule du **Test mode** au **Live mode**, refais les 3 produits, remplace les clés (`pk_live_...`, `sk_live_...`) et le webhook (signing secret différent).
2. **Twilio** : retire le mode trial, charge des crédits réels.
3. **Domaine custom** sur Vercel : **Settings → Domains** → ajoute `speedjobs.ch` (par exemple) → suis les instructions DNS.

---

## 8) Données de test

Pour avoir un candidat et un employeur factices :
1. Inscris-toi via `/login` avec 2 numéros (les tiens, ou avec le mode test Supabase).
2. Récupère les `auth.users.id` : Supabase → **SQL Editor** → `select id, phone from auth.users;`
3. Édite `speedjobs/supabase/seed.sql`, remplace les 2 UUIDs en haut, et `Run`.

---

## Aide / dépannage

- **« Code SMS invalide »** → vérifie que Twilio est bien configuré, et que ton numéro a le `+` et le code pays.
- **« No posts remaining »** → le webhook Stripe n'a pas mis à jour `posts_remaining`. Vérifie dans **Stripe → Webhooks → ton endpoint → Recent deliveries**.
- **Pas de notif push** → vérifie que `NEXT_PUBLIC_FIREBASE_VAPID_KEY` est set ET que tu as autorisé les notifications dans le navigateur. Le SW est généré au build (`scripts/build-firebase-sw.js`), vérifie qu'il a bien les valeurs Firebase quand tu fais `npm run build`.
- **Logs Vercel** : **Vercel → ton projet → Logs**. Tout est en temps réel.
- **Logs Supabase** : Supabase → **Logs Explorer**.
