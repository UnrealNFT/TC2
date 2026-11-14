# TrappistCode IDE

IDE local uncensored + IA intégrée pour TrappistLand.

## Stack

- React 19 + TypeScript + Vite
- CodeMirror 6
- Express + simple-git
- Theme TrappistAI (noir / vert `#00ff41`)

## Démarrage rapide

```bash
npm install
npm run server:dev   # terminal 1 : backend Node
npm run dev          # terminal 2 : frontend Vite
```

Ou tout en un :

```bash
npm run start        # concurrently backend + frontend
```

### Variables d'environnement

```bash
cp .env.example .env
# édite .env avec tes clés
```

## Backend

Port `4269` :

- `/api/files/*` : CRUD sur le workspace local
- `/api/git/*` : status, diff, add, commit, push, pull, branches
- `/api/preview/*` : aperçu live HTML/CSS/JS
- `/api/shell/*` : exécution shell sécurisée
- `/api/templates/*` : création projets Vanilla / React / Node
- `/api/search/*` : recherche web + GitHub

## Fonctionnalités

1. **Workspace local** : picker natif (Chrome/Edge) ou chemin absolu
2. **Nouveau projet** : templates Vanilla, React, Node
3. **Explorateur de fichiers** : tree, création fichier/dossier
4. **Éditeur multi-tabs** : CodeMirror, sauvegarde Ctrl+S
5. **Panel Agent multi-agents** :
   - Worker : Gemma, DeepSeek, Kimi WaveSpeed, Trappist Local
   - Reviewer Kimi 2.7 : tous les 10 tours
   - Fallback Gemma : tous les 5 tours
   - Recherche web/GitHub intégrée
   - Mode autonome avec intervalle réglable
   - Bouton Stop immédiat
6. **Panel Git** : status, diff, stage, commit, push, pull
7. **Preview flottante** : drag & drop + resize, temps réel
8. **Terminal** : commandes npm/node/git/python…

## Modèles supportés

| Nom | Provider | Utilisation |
|---|---|---|
| Gemma | WaveSpeed | Worker / Reviewer |
| DeepSeek | WaveSpeed | Worker |
| Kimi WaveSpeed | WaveSpeed | Worker / Reviewer |
| Kimi API | Moonshot AI | Reviewer premium |
| Local | `localhost:8000` | Worker offline |

## Actions Agent

### Locales
- `edit_file`, `create_file`, `read_file`, `search`

### Buffer
- `edit_buffer`, `set_buffer`

### GitHub
- `list_files`, `read_file`, `create_file`, `patch_file`

### Contrôle
- `done` : arrêter la mission

## Architecture

```
src/
  components/    UI IDE
  hooks/         useWorkspace, useGitHubRepos
  services/      localApi, agentModels, agentSearch, github, localSnapshot
  types/         types partagés
  App.tsx        layout IDE + preview flottante

server/
  index.js       serveur Express
  routes/
    files.js     fs local
    git.js       simple-git
    preview.js   serveur statique
    shell.js     exécution shell sandboxée
    templates.js templates de projets
    search.js    recherche web + GitHub
```
