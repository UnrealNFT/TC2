# pyright: reportMissingImports=false
"""Cerveau de l'agent TrappistCode.

Architecture SOLO (type Copilot) :
- Chaque modèle travaille seul : il planifie, écrit, teste et se relit lui-même.
- Le modèle est choisi par l'utilisateur via model_key (voir agent/models.py).

Stratégie VRAM Ollama :
Le modèle local choisi reste en mémoire pendant la boucle de code.
"""
import json, re, os, urllib.request
import ollama

from . import models

# Actions supportées par tools.py. Le modèle NE doit PAS en inventer d'autres.
SYSTEM_CODER = """Tu es un agent de code autonome (TrappistCode).
A chaque tour tu DOIS répondre par UN SEUL objet JSON. Rien avant, rien après. Pas de ```.
{
  "pensee": "ton raisonnement court",
  "action": "edit_file|write_file|read_file|append_file|delete_file|copy_file|rename_file|move_file|exists_file|list_files|list_tree|get_context|shell|test_project|test_file|commit_push|set_root|done",
  "args": { ... }
}

Actions (utilise EXACTEMENT ces noms) :
- set_root (path) : change le dossier de travail SI l'objectif en donne un autre.
- list_files () : liste les fichiers du workspace.
- list_tree () : arborescence complète.
- get_context (max_files=30) : extrait un résumé du projet.
- read_file (path)
- write_file (path, content) : crée un fichier, ou le RÉÉCRIT en entier (contenu COMPLET). À utiliser si le fichier doit changer complètement ou si edit_file a échoué.
- edit_file (path, old_string, new_string) : outil par défaut. Un extrait court, présent une seule fois.
- test_project () ou test_file (path) : obligatoire avant done. Le mot ok ne termine pas la mission.
- append_file (path, content)
- delete_file (path)
- copy_file (src, dst)
- rename_file (src, dst)
- move_file (src, dst)
- exists_file (path)
- shell (cmd)
- commit_push (message)
- done (resume)

Règles absolues :
- Un seul outil par tour. Pas de texte hors JSON.
- Si le dossier est vide et l'objectif demande de créer quelque chose, fais write_file immédiatement.
- Petite modification d'un fichier existant : edit_file, old_string = lignes ENTIÈRES copiées depuis read_file (jamais depuis un aperçu tronqué).
- Refonte complète d'un fichier (ex: transformer un site en jeu) : write_file avec le contenu COMPLET.
- done seulement après un test_project ou test_file réussi.
- Deux list_files d'affilée sont refusés.
- Commit régulièrement tous les 5 tours.
- Utilise get_context quand tu veux voir le projet en entier.
- NE JAMAIS créer de fichier .py si l'objectif mentionne HTML, CSS, JS, site web, page web, jeu web, Three.js, React ou frontend. Dans ce cas, les extensions doivent être .html, .css, .js, .jsx, .ts ou .tsx UNIQUEMENT.
- Les noms de fichiers ne doivent jamais commencer par un espace ni contenir de caractères spéciaux. Utilise des chemins simples comme index.html, style.css, script.js.
- Quand tu crées un jeu ou site web, crée obligatoirement index.html + style.css + script.js.
- Appelle TOUJOURS list_files au premier tour si le workspace n'est pas vide, pour vérifier ce qui existe déjà."""

SYSTEM_CHAT = """Tu es l'assistant de TrappistCode.
Réponds en français, 2 à 5 phrases, comme dans une discussion.
Uniquement la réponse finale.
Interdit : plan, brouillon, puces, Persona, Draft, Self-correction, JSON, code."""

SYSTEM_CONTROLE = """Tu vérifies un fichier déjà écrit. Tu ne le réécris pas.
Réponds UNIQUEMENT par ce JSON :
{"ok": true, "raison": "court", "suite": "done"}
ok=false seulement s'il manque quelque chose d'essentiel DANS CE FICHIER, par rapport à l'objectif.
suite = done, ou le prochain fichier à créer/modifier. Interdit de redemander le fichier qu'on te montre.
Si le fichier est vide, placeholder, ou n'inclut pas les imports/éléments mentionnés dans l'objectif, ok=false.
Si le fichier est suffisant pour sa part de l'objectif, ok=true. N'invente pas de défauts."""


def _cle_wavespeed() -> str:
    for nom in ("WAVESPEED_API_KEY", "VITE_WAVESPEED_KEY"):
        if os.environ.get(nom):
            return os.environ.get(nom).strip().strip('"')
    env = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.isfile(env):
        for ligne in open(env, encoding="utf-8"):
            if ligne.startswith("VITE_WAVESPEED_KEY=") or ligne.startswith("WAVESPEED_API_KEY="):
                return ligne.split("=", 1)[1].strip().strip('"')
    return ""


def _model_config(model_key: str) -> dict:
    """Récupère la config du modèle demandé."""
    return models.get(model_key)


def _is_wavespeed(model_key: str) -> bool:
    return _model_config(model_key)["type"] == "wavespeed"


def _model_id(model_key: str) -> str:
    return _model_config(model_key)["id"]


def _chat_ollama(messages: list, num_predict: int, temperature: float, as_json: bool = False, modele: str = "") -> dict:
    """Appelle Ollama avec un modèle local."""
    options = {"num_ctx": 12288, "num_predict": num_predict, "temperature": temperature}
    base = {"model": modele, "messages": messages, "options": options}
    essais = []
    if as_json:
        essais.append({**base, "format": "json", "think": False})
        essais.append({**base, "format": "json"})
    essais.append({**base, "think": False})
    essais.append(base)
    dernier = None
    for kw in essais:
        try:
            return ollama.chat(**kw)
        except TypeError as e:
            dernier = e
    if dernier:
        raise dernier
    return {}


def _chat_wavespeed(messages: list, num_predict: int, temperature: float, model_id: str) -> str:
    """Appelle WaveSpeed (Kimi, GLM, etc.). Renvoie le texte brut."""
    cle = _cle_wavespeed()
    if not cle:
        raise RuntimeError("Clé WaveSpeed absente du .env")
    body = json.dumps({
        "model": model_id,
        "temperature": temperature,
        "max_tokens": num_predict,
        "messages": messages,
    }).encode()
    req = urllib.request.Request(
        "https://llm.wavespeed.ai/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {cle}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read().decode())
    return data["choices"][0]["message"]["content"].strip()


def _chat(messages: list, num_predict: int, temperature: float, as_json: bool = False, model_key: str = "gemma") -> str:
    """Point d'entrée unique : choisit Ollama ou WaveSpeed selon le modèle."""
    cfg = _model_config(model_key)
    if cfg["type"] == "ollama":
        reponse = _chat_ollama(messages, num_predict, temperature, as_json=as_json, modele=cfg["id"])
        return _texte(reponse)
    else:
        # WaveSpeed ne supporte pas format=json, on demande du JSON dans le prompt
        if as_json:
            messages = [{"role": "system", "content": "Réponds UNIQUEMENT par un objet JSON valide. Rien d'autre."}] + messages
        return _chat_wavespeed(messages, num_predict, temperature, cfg["id"])


def _texte(reponse: dict) -> str:
    msg = reponse.get("message") or {}
    return (msg.get("content") or msg.get("thinking") or "").strip()


def _objet_json(texte: str) -> dict:
    """Extrait le premier objet JSON complet dans un texte."""
    if not texte:
        return {}
    texte = re.sub(r"\`\`\`(?:json)?", "", texte).strip()
    start = texte.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(texte)):
            if texte[i] == "{":
                depth += 1
            elif texte[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        data = json.loads(texte[start : i + 1])
                    except json.JSONDecodeError:
                        break
                    if isinstance(data, dict):
                        return data
                    break
        start = texte.find("{", start + 1)
    return {}


def extraire_json(texte: str) -> dict:
    """Un ordre d'outil. Ignore les JSON qui n'ont ni action ni plan."""
    data = _objet_json(texte)
    if data.get("action") or data.get("plan"):
        data.setdefault("pensee", "")
        data.setdefault("args", {})
        return data
    return {"pensee": "Pas de JSON utilisable", "action": "list_files", "args": {}}


def _coder(prompt: str, model_key: str = "gemma") -> dict:
    """Un tour du modèle choisi. Pas de fallback : en solo, si ça plante, on remonte l'erreur."""
    messages = [
        {"role": "system", "content": SYSTEM_CODER},
        {"role": "user", "content": prompt + "\n/no_think"},
    ]
    data = extraire_json(_chat(messages, 4500, 0.2, as_json=True, model_key=model_key))
    if data.get("pensee") == "Pas de JSON utilisable":
        data = extraire_json(_chat(messages, 4500, 0.1, as_json=True, model_key=model_key))
    return data


def decider_raw(prompt: str, model_key: str = "gemma") -> dict:
    """Pour la relecture finale. Le prompt est déjà complet."""
    return _coder(prompt, model_key=model_key)


def est_discussion(question: str) -> bool:
    q = question.strip().lower()
    if re.search(r"[a-z]:\\", q):
        return False
    mots_action = (
        "crée", "cree", "créé", "construis", "ecris", "écris", "fichier",
        "commit", "push", "github", "index.html", "modifie", "ajoute",
        "code", "dossier", "repo", "npm", "bug", "css", "html", "amelio",
        "améliore", "supprime", "deplace", "déplace", "copie", "renomme",
        "lis", "lire", "que fait", "répond", "repond", "test",
    )
    mots_chat = (
        "salut", "bonjour", "yo", "hey", "coucou", "hello",
        "comment", "pourquoi", "quoi", "que", "qui", "explique",
        "parle-moi", "parle moi", "ton avis", "tu penses", "c'est quoi",
    )
    if any(w in q for w in mots_action):
        return False
    return any(w in q.split() for w in mots_chat) or len(question.strip()) < 20


def discuter(question: str, model_key: str = "gemma") -> str:
    """Réponse courte, modèle choisi seul."""
    r = _chat(
        [
            {"role": "system", "content": SYSTEM_CHAT},
            {"role": "user", "content": question.strip() + "\n/no_think"},
        ],
        num_predict=500,
        temperature=0.4,
        model_key=model_key,
    )
    texte = r
    if "Persona:" in texte or "Draft" in texte or "Selected response" in texte:
        parts = [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]
        texte = parts[-1] if parts else texte
        texte = re.sub(r"(?is)^(\*+\s*)?(selected response|réponse)\s*:\s*", "", texte).strip()
    return texte[:1200] or "Je suis là."


def repondre_conversation(messages: list, question: str, contexte: str = "", model_key: str = "gemma") -> str:
    """Répond à une question avec un historique conversationnel.
    messages : liste de {'role': 'user'|'assistant', 'content': str}
    """
    conv = messages.copy()
    if contexte:
        conv.append({"role": "user", "content": f"[Contexte projet]\n{contexte[:2500]}\n/no_think"})
    conv.append({"role": "user", "content": question})
    texte = _chat(
        [
            {"role": "system", "content": SYSTEM_CHAT},
            *conv[-12:],
        ],
        num_predict=900,
        temperature=0.35,
        model_key=model_key,
    )
    if "Persona:" in texte or "Draft" in texte or "Selected response" in texte:
        parts = [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]
        texte = parts[-1] if parts else texte
        texte = re.sub(r"(?is)^(\*+\s*)?(selected response|réponse)\s*:\s*", "", texte).strip()
    return texte[:1500] or "Je suis là."


def planner(objectif: str, contexte: str, model_key: str = "gemma") -> dict:
    """Plan optionnel."""
    texte = _chat(
        [
            {"role": "system", "content": '{"pensee":"...","plan":["étape 1","étape 2"]}'},
            {"role": "user", "content": f"OBJECTIF : {objectif}\n\nCONTEXTE :\n{contexte[:3000]}\n/no_think"},
        ],
        num_predict=600,
        temperature=0.2,
        as_json=True,
        model_key=model_key,
    )
    return extraire_json(texte)


def decider(objectif: str, historique: list, contexte: str, guidance: str = "", model_key: str = "gemma") -> dict:
    """Prochaine action. Salutation simple => done direct."""
    msg = objectif.strip().lower()
    if len(msg) < 12 and any(w in msg for w in ("yo", "salut", "bonjour", "hey", "coucou", "hello")):
        return {"pensee": "Salutation", "action": "done", "args": {"resume": "Yo. Dis-moi ce que tu veux construire."}}

    chemin = re.search(r"[a-z]:\\[^\s\"']+", objectif, re.I)
    if chemin and not historique:
        return {
            "pensee": "Le message donne un dossier. Je l'ouvre avant toute réponse.",
            "action": "set_root",
            "args": {"path": chemin.group(0)},
        }

    if est_discussion(objectif) and not historique:
        return {"pensee": "Discussion", "action": "done", "args": {"resume": discuter(objectif, model_key=model_key)}}

    hist = "\n".join(f"- {a} => {str(r)[:350]}" for a, r in historique[-8:]) or "(début)"
    lecture = ""
    if not historique and not est_discussion(objectif):
        lecture = (
            "\n\nTu n'as encore rien fait. Commence par list_files ou get_context pour voir ce qui existe, "
            "puis write_file si le dossier est vide, ou edit_file si tu modifies.\n"
        )

    actions_recentes = [a.get("action") for a, _ in historique[-6:]]
    anti_boucle = ""
    if actions_recentes.count("list_files") >= 2 or actions_recentes.count("read_file") >= 3:
        fichiers = []
        for nom in hist.splitlines()[:20]:
            nom = nom.strip()
            if nom and not nom.endswith("/") and "=>" not in nom:
                fichiers.append(nom)
        anti_boucle = (
            "\n\n⚠️ TU AS DÉJÀ FAIT TROP DE list_files/read_file D'AFFILÉE. "
            "Tu dois AGIR maintenant avec edit_file ou write_file. "
            f"Fichiers existants : {', '.join(fichiers[:10])}. "
            "Interdit de relire un fichier déjà lu."
        )

    prompt = (
        f"OBJECTIF : {objectif}\n\n"
        f"HISTORIQUE (dernières actions) :\n{hist}\n\n"
        f"CONTEXTE PROJET :\n{contexte[:4000]}\n\n"
        f"{lecture}{anti_boucle}"
        "Donne la prochaine action JSON. Un seul outil. "
        "Si tu viens de faire un test réussi et que l'objectif est atteint, action done. "
        "Avant done, appelle test_project ou test_file. Le mot ok ne suffit pas. "
        "N'utilise list_files qu'une fois. "
    )
    if "html" in msg or "css" in msg or "js" in msg or "jeu" in msg or "game" in msg or "site" in msg or "web" in msg or "frontend" in msg:
        prompt += (
            "\n\n🌐 OBJECTIF WEB / JEU WEB DÉTECTÉ. Tu dois créer exactement trois fichiers : index.html, style.css, script.js. "
            "AUCUN fichier .py n'est autorisé. AUCUN nom de fichier ne doit commencer par un espace."
        )
    if guidance:
        prompt += f"\n\nGUIDANCE : {guidance}"

    data = _coder(prompt, model_key=model_key)

    vide = not contexte.strip() or contexte.strip() == "(dossier vide)"
    if vide and not historique and data.get("action") != "write_file":
        data = _coder(prompt + "\n\nInterdit de répondre done. Écris le premier fichier maintenant avec write_file.", model_key=model_key)

    if data.get("action") in ("list_files", "list_tree", "read_file", "get_context") and (
        actions_recentes.count("list_files") >= 2 or actions_recentes.count("read_file") >= 2
    ):
        return {
            "pensee": "Assez lu. Je n'envoie plus de lecture.",
            "action": "done",
            "args": {"resume": "Lectures déjà faites. Je m'arrête au lieu de relire les mêmes fichiers."},
        }

    # Sécurité : interdire les fichiers .py sur un objectif web
    if data.get("action") in ("write_file", "append_file", "delete_file", "copy_file", "rename_file", "move_file"):
        chemin = str(data.get("args", {}).get("path", "")).strip()
        if chemin and ("html" in msg or "css" in msg or "js" in msg or "jeu" in msg or "game" in msg or "site" in msg or "web" in msg or "frontend" in msg):
            if chemin.lower().endswith(".py"):
                data["pensee"] = "Objectif web = fichier Python interdit. Je crée index.html à la place."
                data["action"] = "write_file"
                data["args"] = {"path": "index.html", "content": "<!DOCTYPE html>\n<html lang=\"fr\">\n<head><meta charset=\"UTF-8\" /><link rel=\"stylesheet\" href=\"style.css\" /></head>\n<body>\n<div id=\"game\"></div>\n<script src=\"script.js\"></script>\n</body>\n</html>"}

    return data


def _oui(valeur) -> bool:
    if isinstance(valeur, bool):
        return valeur
    if isinstance(valeur, str):
        return valeur.strip().lower() in ("true", "1", "oui", "yes", "ok")
    return bool(valeur)


def controler(objectif: str, chemin: str, contenu: str, model_key: str = "gemma") -> dict:
    """Le modèle choisi vérifie son propre fichier (solo)."""
    try:
        texte = _chat(
            [
                {"role": "system", "content": SYSTEM_CONTROLE},
                {"role": "user", "content": (
                    f"Objectif : {objectif[:800]}\n"
                    f"Fichier : {chemin}\n"
                    f"Contenu :\n{contenu[:6000]}\n/no_think"
                )},
            ],
            num_predict=250,
            temperature=0.1,
            as_json=True,
            model_key=model_key,
        )
        data = _objet_json(texte)
    except Exception as e:
        return {"ok": True, "raison": f"avis illisible ({e}), on garde le fichier", "suite": "done"}
    if "ok" not in data:
        return {"ok": True, "raison": "avis illisible, on garde le fichier", "suite": "done"}
    return {
        "ok": _oui(data.get("ok")),
        "raison": str(data.get("raison", ""))[:300],
        "suite": str(data.get("suite") or "done")[:200],
    }
