# SpeedJob's

Plateforme de matching d'emplois d'urgence en temps réel (24-48h).

- **Frontend** : Next.js 15 (App Router) + Tailwind
- **Backend** : Supabase (Auth SMS OTP, Postgres, Realtime, Storage, RLS)
- **Paiements** : Stripe (abonnements récurrents)
- **Notifs push** : Firebase Cloud Messaging (FCM)
- **Hébergement** : Vercel

## Démarrage

```bash
cd speedjobs
cp .env.local.example .env.local   # remplir les valeurs
npm install
npm run dev
```

L'app tourne sur http://localhost:3000.

## Base de données

Applique la migration dans le projet Supabase :

```bash
supabase db push                                # via CLI
# ou copier supabase/migrations/0001_init.sql dans le SQL editor
```

Active Realtime sur les tables `jobs` et `applications` (déjà fait via la migration).

## Configuration Supabase

1. **Auth → Providers → Phone** : activer SMS OTP (Twilio ou MessageBird).
2. **Storage** : le bucket `candidate-photos` est créé par la migration.
3. **Realtime** : `jobs` et `applications` sont déjà ajoutées à la publication.

## Configuration Stripe

1. Crée 3 produits récurrents (Starter 19 / Pro 49 / Business 99 CHF/mois).
2. Renseigne les `price_id` dans `.env.local`.
3. Configure un webhook pointant vers `/api/stripe/webhook` (`checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`).

## Configuration FCM

1. Crée un projet Firebase, active Cloud Messaging.
2. Renseigne `FIREBASE_SERVICE_ACCOUNT` (JSON minifié) côté serveur.
3. Renseigne les `NEXT_PUBLIC_FIREBASE_*` côté client.
4. Génère une clé VAPID Web et renseigne `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
5. Le SW `public/firebase-messaging-sw.js` doit avoir la config Firebase publique.

## Structure

```
app/                Routes Next.js (App Router)
  (auth)/           login, verify, role
  candidate/        signup, home, profile, job/[id]
  employer/         signup, dashboard, create-job, job/[id]
  api/              stripe/checkout, stripe/webhook, fcm/register
components/         UI + shared
actions/            Server Actions (auth, candidate, employer)
lib/                supabase, stripe, fcm, auth, utils
types/              types TypeScript stricts (générés depuis schema)
supabase/migrations/  schémas SQL + RLS
```

## Routes

- `/` landing
- `/login` saisie du numéro de téléphone
- `/verify` saisie du code SMS
- `/role` choix du rôle
- `/candidate/signup` création profil candidat (skills + photo)
- `/candidate/home` toggle ONLINE + feed des urgences
- `/candidate/profile` édition profil
- `/candidate/job/[id]` détail urgence + accepter + noter
- `/employer/signup` choix plan + paiement Stripe
- `/employer/dashboard` solde de posts + liste annonces
- `/employer/create-job` formulaire urgence
- `/employer/job/[id]` liste live des candidats (FIFO) + confirm + noter

## Notes prod

- `next build && next start` ; Vercel détecte tout seul.
- `STRIPE_WEBHOOK_SECRET` est obligatoire pour la route webhook.
- Pour le SW FCM, remplace les `self.NEXT_PUBLIC_*` par les vraies valeurs avant le déploiement ou ajoute un script de build qui les injecte.
