# pyright: reportMissingImports=false
"""Cerveau de l'agent TrappistCode.

Architecture :
- Gemma 4 Uncensored (12B) : cerveau principal, planifie, discute, écrit le code.
- DeepSeek/Qwen Uncensored : relecteur critique et contrôleur de fichiers.
- Kimi K2.7 Code (WaveSpeed) : supervisor externe et fallback hardware.

Stratégie VRAM Ollama :
Gemma reste en mémoire pendant la boucle de code. DeepSeek est appelé uniquement
pour controler() : Ollama décharge Gemma, charge DeepSeek, puis Gemma est
rechargée au tour suivant.
"""
import json, re, os, urllib.request
import ollama

# Noms exacts de ollama list.
MODELE_CERVEAU = "satgeze/gemma4-12b-uncensored-1m:latest"
MODELE_RELECTEUR = "hf.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-i1-GGUF:Q4_K_M"
MODELE_KIMI = "moonshotai/kimi-k2.7-code"

# Actions supportées par tools.py. Gemma NE doit PAS en inventer d'autres.
SYSTEM_CODER = """Tu es un agent de code autonome (TrappistCode).
A chaque tour tu DOIS répondre par UN SEUL objet JSON. Rien avant, rien après. Pas de ```.
{
  "pensee": "ton raisonnement court",
  "action": "write_file|read_file|append_file|delete_file|copy_file|rename_file|move_file|exists_file|list_files|list_tree|get_context|shell|commit_push|set_root|done",
  "args": { ... }
}

Actions (utilise EXACTEMENT ces noms) :
- set_root (path) : change le dossier de travail SI l'objectif en donne un autre.
- list_files () : liste les fichiers du workspace.
- list_tree () : arborescence complète.
- get_context (max_files=30) : extrait un résumé du projet.
- read_file (path)
- write_file (path, content)
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
- Ne réponds done que si l'objectif est réellement atteint.
- Commit régulièrement tous les 5 tours.
- Utilise get_context quand tu veux voir le projet en entier.
- NE JAMAIS créer de fichier .py si l'objectif mentionne HTML, CSS, JS, site web, page web, jeu web, Three.js, React ou frontend. Dans ce cas, les extensions doivent être .html, .css, .js, .jsx, .ts ou .tsx UNIQUEMENT.
- Les noms de fichiers ne doivent jamais commencer par un espace ni contenir de caractères spéciaux. Utilise des chemins simples comme index.html, style.css, script.js.
- Quand tu crées un jeu ou site web, crée obligatoirement index.html + style.css + script.js.
- Appelle TOUJOURS list_files au premier tour si le workspace n'est pas vide, pour vérifier ce qui existe déjà."""

SYSTEM_REVIEWER = """Tu es un reviewer uncensored. 2 phrases en français : est-ce que l'action a avancé l'objectif, et quelle est la prochaine correction concrète. Pas de JSON."""

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

SYSTEM_RELECTURE_GEMMA = """Tu relis un fichier déjà validé par un autre modèle.
Réponds UNIQUEMENT par ce JSON :
{"ok": true, "raison": "court"}
ok=false si tu vois une erreur SyntaxError, une import manquant, un return manquant, une balise mal fermée, ou une incohérence visible.
ok=false si l'objectif demande un site web/jeu web et que le fichier est .py.
ok=false si le nom du fichier commence par un espace ou un caractère spécial.
ok=true si le fichier semble propre."""

SYSTEM_KIMI_SUPERVISOR = """Tu es Kimi, supervisor externe de TrappistCode.
Réponds en francais, 5 à 12 phrases maximum.
Donne :
1. Un diagnostic de la situation
2. Les anomalies/blockages
3. Les prochaines 1 à 3 actions concrètes à faire
4. Si l'objectif semble atteint, dis "done"
Sois technique, percutant, sans langage de bois."""

SYSTEM_KIMI_FINAL = """Tu es Kimi, superviseur final de TrappistCode.
Réponds en français, 4 à 8 phrases.
Donne :
1. Si l'objectif semble atteint
2. Les bugs ou incohérences visibles
3. Les améliorations concrètes à faire, ou dis "done" si c'est bon
Sois direct, ne réécris pas le code."""


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


def _chat(messages: list, num_predict: int, temperature: float, as_json: bool = False, modele: str = "") -> dict:
    """Appelle Ollama. modele vaut Gemma par défaut. Passer MODELE_RELECTEUR pour DeepSeek/Qwen."""
    options = {"num_ctx": 12288, "num_predict": num_predict, "temperature": temperature}
    base = {"model": modele or MODELE_CERVEAU, "messages": messages, "options": options}
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


def _coder_with_fallback(prompt: str, prior_messages: list = None) -> dict:
    """Un tour de Gemma, avec fallback Kimi si Ollama plante."""
    messages = prior_messages or [
        {"role": "system", "content": SYSTEM_CODER},
        {"role": "user", "content": prompt + "\n/no_think"},
    ]
    try:
        data = extraire_json(_texte(_chat(messages, 4500, 0.2, as_json=True)))
        if data.get("pensee") == "Pas de JSON utilisable":
            data = extraire_json(_texte(_chat(messages, 4500, 0.1, as_json=True)))
        return data
    except Exception as e:
        err = str(e).lower()
        if "prediction aborted" in err or "token repeat" in err or "repeat limit" in err:
            print(f"[brain] Ollama en boucle, fallback Kimi demandé : {e}")
            return secours_kimi(prompt)
        raise


def _coder(prompt: str) -> dict:
    return _coder_with_fallback(prompt)


def decider_raw(prompt: str) -> dict:
    """Pour la relecture finale. Le prompt est déjà complet."""
    return _coder(prompt)


def est_discussion(question: str) -> bool:
    q = question.strip().lower()
    # un chemin Windows n'est pas une discussion
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


def discuter(question: str) -> str:
    """Réponse courte, Gemma seule."""
    r = _chat(
        [
            {"role": "system", "content": SYSTEM_CHAT},
            {"role": "user", "content": question.strip() + "\n/no_think"},
        ],
        num_predict=500,
        temperature=0.4,
    )
    texte = _texte(r)
    if "Persona:" in texte or "Draft" in texte or "Selected response" in texte:
        parts = [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]
        texte = parts[-1] if parts else texte
        texte = re.sub(r"(?is)^(\*+\s*)?(selected response|réponse)\s*:\s*", "", texte).strip()
    return texte[:1200] or "Je suis là."


def repondre_conversation(messages: list, question: str, contexte: str = "") -> str:
    """Répond à une question avec un historique conversationnel.
    messages : liste de {'role': 'user'|'assistant', 'content': str}
    """
    conv = messages.copy()
    if contexte:
        conv.append({"role": "user", "content": f"[Contexte projet]\n{contexte[:2500]}\n/no_think"})
    conv.append({"role": "user", "content": question})
    r = _chat(
        [
            {"role": "system", "content": SYSTEM_CHAT},
            *conv[-12:],
        ],
        num_predict=900,
        temperature=0.35,
    )
    texte = _texte(r)
    if "Persona:" in texte or "Draft" in texte or "Selected response" in texte:
        parts = [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]
        texte = parts[-1] if parts else texte
        texte = re.sub(r"(?is)^(\*+\s*)?(selected response|réponse)\s*:\s*", "", texte).strip()
    return texte[:1500] or "Je suis là."


def planner(objectif: str, contexte: str) -> dict:
    """Plan optionnel."""
    r = _chat(
        [
            {"role": "system", "content": '{"pensee":"...","plan":["étape 1","étape 2"]}'},
            {"role": "user", "content": f"OBJECTIF : {objectif}\n\nCONTEXTE :\n{contexte[:3000]}\n/no_think"},
        ],
        num_predict=600,
        temperature=0.2,
        as_json=True,
    )
    return extraire_json(_texte(r))


def decider(objectif: str, historique: list, contexte: str, guidance: str = "") -> dict:
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
        return {"pensee": "Discussion", "action": "done", "args": {"resume": discuter(objectif)}}

    hist = "\n".join(f"- {a} => {str(r)[:350]}" for a, r in historique[-8:]) or "(début)"
    lecture = ""
    if any(k in msg for k in ("lis", "lire", "que fait", "répond", "repond")):
        lecture = (
            "\nLis avec list_files puis read_file. Interdit de répondre done avant. "
            "Le resume du done sera ta réponse en français, pas le mot terminé."
        )

    # Détection anti-boucle
    actions_recentes = [a.get("action") for a, _ in historique[-6:]]
    anti_boucle = ""
    if actions_recentes.count("list_files") >= 3 or actions_recentes.count("read_file") >= 3:
        fichiers = []
        for nom in contexte.splitlines()[:25]:
            nom = nom.strip()
            if nom and not nom.endswith("/") and any(nom.lower().endswith(ext) for ext in (".html", ".css", ".js", ".ts", ".tsx", ".py", ".json", ".md")):
                fichiers.append(nom)
        anti_boucle = (
            "\n\n⚠️ TU AS DÉJÀ FAIT TROP DE list_files/read_file D'AFFILÉE. "
            "Tu dois AGIR maintenant : write_file, append_file, delete_file, rename_file, copy_file, shell ou commit_push. "
            f"Fichiers existants ({len(fichiers)}) : {', '.join(fichiers[:10])}. "
            "Si l'objectif est atteint, appelle done."
        )

    prompt = (
        f"OBJECTIF : {objectif}\n\n"
        f"FICHIERS :\n{contexte[:1800] or '(dossier vide)'}\n\n"
        f"HISTORIQUE :\n{hist}\n\n"
    )
    if guidance:
        prompt += f"GUIDANCE : {guidance}\n\n"
    prompt += (
        "EXPORTE un seul JSON avec 'action', 'args', 'pensee'. "
        "Interdit de répondre avec du texte libre, du markdown ou plusieurs blocs. "
        "Si le dossier est vide, écris un premier fichier avec write_file. "
        "Si les fichiers existent déjà, AMÉLIORE-LES (write_file/append_file) au lieu de lister. "
        "N'utilise list_tree/list_files qu'au tout premier tour. Ensuite c'est une perte de temps."
    )
    if "html" in msg or "css" in msg or "js" in msg or "jeu" in msg or "game" in msg or "site" in msg or "web" in msg or "frontend" in msg:
        prompt += (
            "\n\n⚠️ OBJECTIF WEB / JEU WEB DÉTECTÉ. Tu dois créer exactement trois fichiers : index.html, style.css, script.js. "
            "AUCUN fichier .py n'est autorisé. AUCUN nom de fichier ne doit commencer par un espace."
        )
    prompt += lecture + anti_boucle

    try:
        data = _coder(prompt)
    except Exception as e:
        return secours_kimi(prompt) or {"pensee": "fallback erreur", "action": "done", "args": {"resume": f"Erreur LLM: {e}"}}

    vide = not contexte.strip() or contexte.strip() == "(dossier vide)"
    if vide and not historique and data.get("action") != "write_file":
        data = _coder(prompt + "\n\nInterdit de répondre done. Écris le premier fichier maintenant avec write_file.")

    # Si on détecte une action répétitive inutile, forcer write_file ou done
    if data.get("action") in ("list_files", "list_tree") and actions_recentes.count("list_files") >= 2:
        fichiers = []
        for nom in contexte.splitlines()[:25]:
            nom = nom.strip()
            if nom and not nom.endswith("/") and any(nom.lower().endswith(ext) for ext in (".html", ".css", ".js", ".ts", ".tsx", ".py", ".json", ".md")):
                fichiers.append(nom)
        if fichiers:
            return {"pensee": "Forçage d'action concrète après listes répétées.", "action": "read_file", "args": {"path": fichiers[0]}}

    # Sécurité : interdire les fichiers .py sur un objectif web
    if data.get("action") in ("write_file", "append_file", "delete_file", "copy_file", "rename_file", "move_file"):
        chemin = str(data.get("args", {}).get("path", "")).strip()
        if chemin and ("html" in msg or "css" in msg or "js" in msg or "jeu" in msg or "game" in msg or "site" in msg or "web" in msg or "frontend" in msg):
            if chemin.lower().endswith(".py"):
                data["pensee"] = "Objectif web = fichier Python interdit. Je crée index.html à la place."
                data["action"] = "write_file"
                data["args"] = {"path": "index.html", "content": "<!DOCTYPE html>\n<html lang=\"fr\">\n<head><meta charset=\"UTF-8\" /><link rel=\"stylesheet\" href=\"style.css\" /></head>\n<body>\n<div id=\"game\"></div>\n<script src=\"script.js\"></script>\n</body>\n</html>"}

    return data


def verifier(objectif: str, action: dict, resultat: str) -> str:
    """Commentaire court pour le journal."""
    debut = (resultat or "").lstrip()
    if debut.startswith(("OK ", "Dossier de travail", "Commit local", "Commit:")) and "Erreur" not in debut[:80]:
        return "Action réussie. Continuer vers la prochaine étape concrète."
    try:
        r = _chat(
            [
                {"role": "system", "content": SYSTEM_REVIEWER},
                {"role": "user", "content": f"Objectif : {objectif[:500]}\nAction : {action.get('action')}\nRésultat : {resultat[:800]}\n/no_think"},
            ],
            num_predict=120,
            temperature=0.2,
            modele=MODELE_RELECTEUR,
        )
        return _texte(r) or "Résultat reçu."
    except Exception as e:
        return f"Reviewer indisponible ({e}). Continuer."


def _oui(valeur) -> bool:
    if isinstance(valeur, bool):
        return valeur
    if isinstance(valeur, str):
        return valeur.strip().lower() in ("true", "1", "oui", "yes", "ok")
    return bool(valeur)


def controler(objectif: str, chemin: str, contenu: str) -> dict:
    """DeepSeek/Qwen juge le fichier. Appelé après write_file."""
    try:
        r = _chat(
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
            modele=MODELE_RELECTEUR,
        )
        data = _objet_json(_texte(r))
    except Exception as e:
        return {"ok": True, "raison": f"avis illisible ({e}), on garde le fichier", "suite": "done"}
    if "ok" not in data:
        return {"ok": True, "raison": "avis illisible, on garde le fichier", "suite": "done"}
    return {
        "ok": _oui(data.get("ok")),
        "raison": str(data.get("raison", ""))[:300],
        "suite": str(data.get("suite") or "done")[:200],
    }


def relire_gemma(objectif: str, chemin: str, contenu: str) -> dict:
    """Gemma relit un fichier déjà validé par DeepSeek."""
    try:
        r = _chat(
            [
                {"role": "system", "content": SYSTEM_RELECTURE_GEMMA},
                {"role": "user", "content": (
                    f"Objectif : {objectif[:800]}\n"
                    f"Fichier : {chemin}\n"
                    f"Contenu :\n{contenu[:4000]}\n/no_think"
                )},
            ],
            num_predict=250,
            temperature=0.1,
            as_json=True,
        )
        data = _objet_json(_texte(r))
    except Exception as e:
        return {"ok": True, "raison": f"Gemma indisponible: {e}"}
    if "ok" not in data:
        return {"ok": True, "raison": "avis Gemma illisible"}
    return {"ok": _oui(data.get("ok")), "raison": str(data.get("raison", ""))[:300]}


def secours_kimi(prompt: str) -> dict:
    """Kimi K2.7 Code, fallback quand Ollama est bloqué."""
    cle = _cle_wavespeed()
    if not cle:
        return {"pensee": "pas de clé Kimi", "action": "done", "args": {"resume": "Kimi non appelé : clé WaveSpeed absente du .env."}}
    body = json.dumps({
        "model": MODELE_KIMI,
        "temperature": 0.2,
        "max_tokens": 4096,
        "messages": [
            {"role": "system", "content": SYSTEM_CODER},
            {"role": "user", "content": prompt},
        ],
    }).encode()
    req = urllib.request.Request(
        "https://llm.wavespeed.ai/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {cle}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
        texte = data["choices"][0]["message"]["content"]
    except Exception as e:
        return {"pensee": "Kimi ko", "action": "done", "args": {"resume": f"Kimi indisponible : {e}"}}
    obj = extraire_json(texte)
    if not obj or "action" not in obj:
        return {"pensee": "Kimi texte", "action": "done", "args": {"resume": texte[:2000]}}
    return obj


def kimispeak(messages: list) -> str:
    """Dialogue libre avec Kimi (review/fallback)."""
    cle = _cle_wavespeed()
    if not cle:
        return "Clé WaveSpeed manquante."
    body = json.dumps({
        "model": MODELE_KIMI,
        "temperature": 0.4,
        "max_tokens": 2000,
        "messages": messages,
    }).encode()
    req = urllib.request.Request(
        "https://llm.wavespeed.ai/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {cle}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"❌ Kimi: {e}"


def kimi_supervise(tour: int, objectif: str, historique: list, contexte: str) -> str:
    """Kimi regarde l'état et donne des instructions concrètes."""
    cle = _cle_wavespeed()
    if not cle:
        return ""
    if not historique:
        return ""
    dernieres_actions = []
    for a, r in historique[-8:]:
        action = a.get("action", "?")
        args = a.get("args", {})
        resultat = str(r)[:120]
        dernieres_actions.append(f"{action}({args}) => {resultat}")
    hist_text = "\n".join(dernieres_actions)
    messages = [
        {"role": "system", "content": SYSTEM_KIMI_SUPERVISOR},
        {"role": "user", "content": (
            f"Tour {tour}. Objectif : {objectif}\n\n"
            f"Dernières actions :\n{hist_text}\n\n"
            f"Fichiers (contexte) :\n{contexte[:2500]}"
        )},
    ]
    texte = kimispeak(messages)
    if "done" in texte.lower():
        return ""
    return texte


def kimi_final_review(objectif: str, contenu: str) -> str:
    """Kimi fait un bilan final."""
    messages = [
        {"role": "system", "content": SYSTEM_KIMI_FINAL},
        {"role": "user", "content": f"Objectif : {objectif}\n\nFichiers créés/modifiés :\n{contenu[:5000]}"},
    ]
    return kimispeak(messages)


def call_kimi_fr(message: str) -> str:
    """Wrapper simple pour parler à Kimi en français."""
    return kimispeak([
        {"role": "system", "content": SYSTEM_CHAT},
        {"role": "user", "content": message},
    ])
