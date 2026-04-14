# Excubya

Systeme intelligent de detection d'incidents et d'alertes d'urgence en temps reel.

Excubya utilise l'intelligence artificielle (YOLO + OpenCV) pour analyser les flux de cameras autorisees et detecter automatiquement les accidents, chutes, incendies, et urgences medicales. Les alertes sont envoyees en temps reel aux services d'urgence, reduisant drastiquement le temps d'intervention.

## Fonctionnalites

- **Detection d'accidents** : Collisions vehicules, mouvements brusques
- **Detection de chutes** : Personnes au sol, changement de posture
- **Detection incendie/fumee** : Analyse couleur + mouvement + modele IA
- **Urgences medicales** : Personne immobile au sol
- **Alertes multi-canal** : WebSocket temps reel, Webhook, Email, SMS
- **Dashboard web** : Monitoring en direct avec flux cameras
- **Carte interactive** : Visualisation geographique des cameras et incidents
- **API REST** : Integration avec systemes externes
- **Gestion des cameras** : RTSP, HTTP, reconnexion automatique

## Architecture

```
Excubya/
├── main.py                  # Point d'entree
├── config/                  # Configuration (env, settings)
├── src/
│   ├── app.py              # Application FastAPI
│   ├── core/
│   │   ├── models.py       # Modeles de base de donnees
│   │   └── events.py       # Bus d'evenements temps reel
│   ├── cameras/
│   │   └── manager.py      # Gestion des flux cameras
│   ├── detection/
│   │   ├── detector.py     # Moteur de detection IA
│   │   └── pipeline.py     # Pipeline d'analyse
│   ├── alerts/
│   │   └── alert_manager.py # Systeme d'alertes multi-canal
│   └── api/
│       ├── routes.py       # Endpoints REST + WebSocket
│       └── schemas.py      # Schemas de validation
├── templates/               # Dashboard HTML
├── static/                  # CSS + JS
├── tests/                   # Tests unitaires
├── Dockerfile
└── docker-compose.yml
```

## Installation

### Prerequis

- Python 3.10+
- pip

### Installation locale

```bash
# Cloner le repo
git clone <repo-url>
cd Excubya

# Creer un environnement virtuel
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou: venv\Scripts\activate  # Windows

# Installer les dependances
pip install -r requirements.txt

# Configurer
cp .env.example .env
# Editez .env avec vos parametres

# Lancer
python main.py
```

### Docker

```bash
# Configurer
cp .env.example .env

# Lancer
docker-compose up -d
```

### Acceder au dashboard

- **Dashboard** : http://localhost:8000
- **Carte** : http://localhost:8000/map
- **API Docs** : http://localhost:8000/docs

## Utilisation

### 1. Ajouter une camera

Via le dashboard (bouton "+ Ajouter") ou via l'API :

```bash
curl -X POST http://localhost:8000/api/cameras \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Camera Parking A",
    "stream_url": "rtsp://192.168.1.100:554/stream1",
    "location_name": "Parking A, Niveau -1",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "zone_type": "parking",
    "detection_enabled": true
  }'
```

### 2. Recevoir les alertes en temps reel

Connectez-vous au WebSocket :

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/alerts');
ws.onmessage = (event) => {
  const alert = JSON.parse(event.data);
  console.log('ALERTE:', alert.data.incident_type, alert.data.description);
};
```

### 3. Configurer les notifications

Dans `.env`, configurez les canaux de notification :

- **Webhook** : `EXCUBYA_WEBHOOK_URL=https://votre-service.com/webhook`
- **Email** : Configurez SMTP dans `.env`
- **SMS** : Configurez l'API SMS dans `.env`

## API Reference

| Methode | Endpoint | Description |
|---------|----------|-------------|
| GET | /api/cameras | Lister les cameras |
| POST | /api/cameras | Ajouter une camera |
| GET | /api/cameras/{id}/snapshot | Capture d'ecran |
| GET | /api/incidents | Lister les incidents |
| PUT | /api/incidents/{id} | Mettre a jour un incident |
| GET | /api/alerts | Lister les alertes |
| POST | /api/alerts/{id}/acknowledge | Accuser reception |
| GET | /api/contacts | Contacts d'urgence |
| GET | /api/stats | Statistiques systeme |
| WS | /ws/alerts | Alertes temps reel |
| WS | /ws/camera/{id} | Flux camera live |

## Configuration

Toutes les options sont configurables via variables d'environnement (prefixe `EXCUBYA_`).
Voir `.env.example` pour la liste complete.

## Tests

```bash
pytest tests/ -v
```

## Licence

MIT
