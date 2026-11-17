# TrappistCode IDE

IDE local + IA locale pour TrappistLand.

## Stack

- React 19 + TypeScript + Vite
- CodeMirror 6
- Express + simple-git (backend IDE, port 4269)
- FastAPI Python `server.py` (agent IA : Ollama local + WaveSpeed, port 8000)
- Theme TrappistAI (noir / vert `#00ff41`)

## Démarrage rapide

### 1️⃣ Agent IA local

```bash
# Depuis le repo TrappistCode
python server.py
```

Le serveur agents tourne sur `http://localhost:8000`.

### 2️⃣ Backend IDE

```bash
cd server
npm install
npm run dev
```

Port `4269`.

### 3️⃣ Frontend

```bash
npm install
npm run dev
```

Port `5173`.

### Lancer tout ensemble

```bash
npm install
cd server && npm install && cd ..
npm run start
```

## Configuration

Copie `.env.example` en `.env` et adapte :

```env
WAVESPEED_API_KEY=wsk_live_9ZQB7Jv9Yh6dfdfdsfsfsdfXHDDvXhK8rtCsTQiwM
WAVESPEED_MODEL=moonshotai/kimi-k2.7-code
PORT=4269
TRAPPIST_WORKSPACE=C:\Users\Djaf\TrappistWorkspaces
VITE_GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

## Backend IDE — routes

Port `4269` :

- `/api/files/*` : CRUD workspace local
- `/api/git/*` : status, diff, add, commit, push, pull, branches
- `/api/preview/*` : aperçu live HTML/CSS/JS
- `/api/shell/*` : terminal sandboxé
- `/api/templates/*` : templates Vanilla / React / Node
- `/api/search/*` : recherche web + GitHub
- `/api/zip/*` : export/import ZIP du workspace

## Agent IA

L'agent de l'IDE appelle le serveur Python :

- Question rapide : `POST /ask`
- Mission autonome : `POST /agent/run` (envoie `workspace`)
- Status live : `GET /agent/status`

Mode solo, comme GitHub Copilot : tu choisis un modèle dans le panneau Agent et il travaille seul du début à la fin, sans relais vers un autre modèle.

Modèles disponibles (`GET /models`, définis dans `agent/models.py`) :

| Clé | Modèle | Type |
|---|---|---|
| `gemma` (défaut) | Gemma 4 12B | Ollama, local |
| `deepseek` | DeepSeek-Qwen 9B | Ollama, local |
| `kimi` | Kimi K2.7 | WaveSpeed, en ligne |
| `glm` | GLM 5.3 Flash | WaveSpeed, en ligne |

## Fonctionnalités

1. **Workspace local** : picker natif *ou* chemin absolu (Windows supporté)
2. **Templates** Vanilla / React / Node
3. **Explorateur de fichiers** avec création de fichiers/dossiers
4. **Éditeur multi-tabs** avec sauvegarde Ctrl+S
5. **Panel Git** : status, diff, stage, commit, push, pull
6. **Terminal shell** sécurisé
7. **Preview** live pour les fichiers HTML
8. **Agent IA local** + mode autonome
9. **Export / import ZIP** du workspace
10. **Intégration GitHub** (token)
