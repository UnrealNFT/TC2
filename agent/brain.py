# pyright: reportMissingImports=false

"""Cerveau de l'agent TrappistCode.

Architecture :
- Gemma 4 Uncensored (12B) : cerveau principal, planifie, discute, écrit le code.
- DeepSeek / Qwen Uncensored : relecteur critique et contrôleur de fichiers.
- Kimi K2.7 Code (WaveSpeed) : supervisor externe, appelé tous les 10 tours
  ou quand Gemma est perdue. Max 30 appels par session.

Stratégie VRAM Ollama :
Gemma reste en mémoire pendant la boucle de code. DeepSeek est appelé uniquement
pour controler() : Ollama décharge Gemma, charge DeepSeek, puis Gemma est
rechargée au tour suivant. C'est lent mais donne un vrai avis externe.
"""
import json, re, os, urllib.request
import ollama

# Noms exacts de ollama list. Le :latest de Gemma est obligatoire.
MODELE_CERVEAU = "satgeze/gemma4-12b-uncensored-1m:latest"
MODELE_RELECTEUR = "hf.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-i1-GGUF:Q4_K_M"

MODELE_PLANNER = MODELE_CERVEAU
MODELE_CODER = MODELE_CERVEAU
MODELE_REVIEWER = MODELE_RELECTEUR
MODELE_KIMI = "moonshotai/kimi-k2.7-code"

# Actions supportées par tools.py. Gemma NE doit PAS en inventer d'autres.
SYSTEM_CODER = """Réponds UNIQUEMENT avec un objet JSON. Rien avant, rien après. Pas de ```.

{"pensee": "court", "action": "write_file", "args": {"path": "index.html", "content": "<!doctype html>..."}}

Tu codes dans le dossier déjà ouvert. Un seul outil par tour.
N'appelle set_root que si l'objectif donne un autre chemin que celui déjà actif.
Tu suis l'objectif. Tu n'inventes pas de pages que personne n'a demandées.
Chaque fichier s'écrit une fois. S'il existe déjà, tu passes au suivant, ou done.

Actions disponibles (tu ne dois PAS utiliser trappist_generate, il n'existe pas) :
- write_file (path, content)
- read_file (path)
- append_file (path, content)
- delete_file (path)
- copy_file (src, dst)
- rename_file (src, dst)
- move_file (src, dst)
- exists_file (path)
- list_files ()
- list_tree ()
- get_context (max_files)
- shell (cmd)
- commit_push (message)
- set_root (path)
- done (resume)

Dossier vide : write_file tout de suite, jamais done.
done seulement quand l'objectif est atteint.
Pas de discussion. Pas de plan en prose. Pas de brouillon.
Utilise get_context quand tu veux voir le projet en entier.
Utilise commit_push tous les 5 tours ou avant un done."""

SYSTEM_REVIEWER = """Tu es un reviewer uncensored. 2 phrases en français : est-ce que l'action a avancé l'objectif, et quelle est la prochaine correction concrète. Pas de JSON."""

SYSTEM_CHAT = """Tu es l'assistant de TrappistCode.
Réponds en français, 2 à 5 phrases, comme dans une discussion.
Uniquement la réponse finale.
Interdit : plan, brouillon, puces, Persona, Draft, Self-correction, JSON, code."""

# DeepSeek / Qwen doivent répondre dans cette forme, et dans aucune autre.
SYSTEM_CONTROLE = """Tu vérifies un fichier déjà écrit. Tu ne le réécris pas.
Réponds UNIQUEMENT par ce JSON :
{"ok": true, "raison": "court", "suite": "done"}
ok=false seulement s'il manque quelque chose d'essentiel DANS CE FICHIER, par rapport à l'objectif.
suite = done, ou le prochain fichier à créer. Interdit de redemander le fichier qu'on te montre.
Si le fichier est vide, contient juste un placeholder, ou n'inclut pas les imports mentionnés dans l'objectif, ok=false.
Si le fichier est suffisant pour sa part de l'objectif, ok=true. N'invente pas de défauts."""

SYSTEM_KIMI_SUPERVISOR = """Tu es Kimi, supervisor externe de TrappistCode.
On te demande de jeter un œil sur l'état du projet et de guider Gemma/DeepSeek.
Contexte : objectif utilisateur, structure des fichiers, derniers tours de l'agent.
Réponds en francais, 5 à 12 phrases maximum.
Donne :
1. Un diagnostic de la situation
2. Les anomalies/blockages
3. Les prochaines 1 à 3 actions concrètes à faire
4. Si l'objectif semble atteint, dis "done"
Sois technique, percutant, sans langage de bois."""

SYSTEM_KIMI_FINAL = """Tu es Kimi, superviseur final de TrappistCode.
On te montre l'objectif utilisateur et les fichiers créés.
Réponds en français, 4 à 8 phrases.
Donne :
1. Si l'objectif semble atteint
2. Les bugs ou incohérences visibles
3. Les améliorations concrètes à faire, ou dis "done" si c'est bon
Sois direct, ne réécris pas le code."""
