# Deploiement Excubya sur Railway

## Etapes

### 1. Creer un compte Railway
Allez sur https://railway.app et connectez-vous avec GitHub.

### 2. Creer un nouveau projet
- Cliquez sur **"New Project"**
- Selectionnez **"Deploy from GitHub repo"**
- Choisissez le repo **`imperador7pro-spec/Excubya`**
- Railway detectera automatiquement le `Dockerfile` et le `railway.toml`

### 3. Configurer les variables d'environnement

Dans le dashboard Railway, onglet **Variables**, ajoutez :

```
EXCUBYA_DEBUG=false
EXCUBYA_HOST=0.0.0.0
EXCUBYA_SECRET_KEY=<generer-une-cle-aleatoire>
EXCUBYA_DATABASE_URL=sqlite+aiosqlite:///./excubya.db
EXCUBYA_DETECTION_MODEL=yolov8n.pt
EXCUBYA_DETECTION_CONFIDENCE=0.5
EXCUBYA_ALERT_COOLDOWN_SECONDS=60
```

**Variables optionnelles** (alertes) :
```
EXCUBYA_WEBHOOK_URL=https://votre-webhook.com/alerts
EXCUBYA_SMTP_HOST=smtp.gmail.com
EXCUBYA_SMTP_PORT=587
EXCUBYA_SMTP_USER=votre@email.com
EXCUBYA_SMTP_PASSWORD=<app-password>
EXCUBYA_ALERT_EMAIL=destinataire@email.com
```

### 4. Ajouter un volume persistant (pour la DB SQLite)

Dans Railway :
- Onglet **Settings** > **Volumes**
- Cliquez **"New Volume"**
- Mount path : `/app/data`
- Modifiez `EXCUBYA_DATABASE_URL=sqlite+aiosqlite:///./data/excubya.db`

**Alternative recommandee** : utiliser PostgreSQL Railway
- Dans le projet, cliquez **"New"** > **"Database"** > **"PostgreSQL"**
- Copiez l'URL de connexion et definissez :
  `EXCUBYA_DATABASE_URL=postgresql+asyncpg://...`
- Ajoutez `asyncpg==0.29.0` dans `requirements.txt`

### 5. Generer un domaine public

- Onglet **Settings** > **Networking**
- Cliquez **"Generate Domain"**
- Votre app sera accessible sur `https://excubya-production.up.railway.app`

### 6. Deploiement

Railway deploie automatiquement a chaque push sur `main`. Pour forcer un redeploiement :
- Onglet **Deployments** > **"Redeploy"**

## Limitations a noter

- **YOLO model** : le modele (~6 MB pour yolov8n) sera telecharge au premier demarrage
- **OpenCV** : les dependencies systeme sont dans le Dockerfile (deja pret)
- **Memoire** : prevoir au moins **512 MB RAM** (1 GB recommande pour YOLO)
- **CPU** : la detection tourne sur CPU par defaut (pas de GPU sur Railway)
- **Stockage** : les snapshots sont stockes localement - prevoir un volume ou un stockage externe (S3/R2)

## Monitoring

- **Logs** : onglet **Deployments** > selectionner le deployment > **"View Logs"**
- **Metrics** : onglet **Metrics** (CPU, RAM, reseau)
- **Health check** : Railway verifie `/api/stats` toutes les 30s
