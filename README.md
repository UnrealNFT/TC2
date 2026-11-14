# TrappistCode IDE

IDE local uncensored pour TrappistLand. Interface React + backend Node.js/Express.

## Stack

- React 19 + TypeScript + Vite
- CodeMirror 6
- Express + simple-git
- Theme TrappistAI (noir / vert `#00ff41`)

## Démarrage rapide

```bash
npm install
npm run server:dev   # terminal 1
npm run dev          # terminal 2
```

Ou en une commande :

```bash
npm run start        # concurrently : backend + frontend
```

## Backend

Port `4269` :

- `/api/files/*` : lister, lire, écrire, créer dossier, renommer, supprimer
- `/api/git/*` : status, diff, add, commit, push, pull, branches, checkout
- `/api/preview/*` : aperçu live des fichiers HTML/CSS/JS

## Fonctionnalités IDE

1. **Workspace local** : ouvrir n'importe quel dossier de ton système
2. **Explorateur de fichiers** : tree, création fichier/dossier
3. **Éditeur multi-tabs** : CodeMirror, sauvegarde Ctrl+S
4. **Chat Agent** : modèles Groq / Kimi / Claude / local
5. **Panel Git** : status, diff, stage, commit, push, pull
6. **Preview live** : rendu temps réel comme CodePen
7. **Terminal** : placeholder prêt pour commandes shell

## Actions Agent

### Locales (workspace)

- `edit_file` : modifier un fichier local
- `create_file` : créer un fichier
- `read_file` : lire un fichier

### Buffer (éditeur)

- `edit_buffer` / `set_buffer` : modifier le fichier ouvert

### GitHub

- `list_files`, `read_file`, `create_file`, `patch_file`

## Architecture

```
src/
  components/    UI IDE (Sidebar, FileExplorer, TabbedEditor, AgentPanel, GitPanel, PreviewPanel, TerminalPanel)
  hooks/         useWorkspace
  services/      localApi, localAgent, github
  types/         types partagés
  App.tsx        layout principal

server/
  index.js       serveur Express
  routes/
    files.js     fs local
    git.js       simple-git
    preview.js   serveur statique
```
