# TrappistCode IDE

IDE local + IA locale pour TrappistLand.

## Stack

- React 19 + TypeScript + Vite
- CodeMirror 6
- Express + simple-git (backend IDE)
- Ollama via ton propre serveur Python `server.py`
- Theme TrappistAI (noir / vert `#00ff41`)

## Démarrage rapide

### 1. Lancer ton agent local (depuis le repo TrappistCode)

```bash
cd /chemin/vers/TrappistCode
python server.py
```

Le serveur agents doit tourner sur `http://localhost:8000/ask`.

### 2. Lancer le backend IDE (ce repo)

```bash
cd server && npm install && npm run dev
```

Port `4269`.

### 3. Lancer le frontend

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

## Backend IDE

Port `4269` :

- `/api/files/*` : CRUD workspace local
- `/api/git/*` : status, diff, add, commit, push, pull
- `/api/preview/*` : aperçu live HTML/CSS/JS
- `/api/shell/*` : terminal sandboxé
- `/api/templates/*` : templates Vanilla / React / Node
- `/api/search/*` : recherche web + GitHub

## Agent IA

L'agent de l'IDE appelle ton backend Ollama local sur `http://localhost:8000/ask`.

Il supporte les actions :
- `edit_buffer` : modifier le fichier ouvert
- `edit_file` : modifier un fichier du workspace
- `create_file` : créer un fichier
- `read_file` : lire un fichier
- `search` : recherche web/GitHub
- `done` / `TERMINÉ` : arrêter la mission

## Fonctionnalités

1. Workspace local via picker natif ou chemin absolu
2. Templates de projets Vanilla / React / Node
3. Explorateur de fichiers + éditeur multi-tabs
4. Panel Git : status, diff, stage, commit, push, pull
5. Terminal shell sécurisé
6. Preview flottante draggable & resizable
7. Agent IA local + mode autonome
