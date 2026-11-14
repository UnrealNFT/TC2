# pyright: reportMissingImports=false

"""Cerveau de l'agent TrappistCode.

Deux modèles, deux rôles :
- Gemma planifie, discute et écrit le code. Elle reste chargée pendant la boucle.
- DeepSeek ne sert qu'à controler() : il lit un fichier déjà écrit et dit s'il est bon.
  Ollama décharge alors Gemma (7,6 Go) pour charger DeepSeek (5,6 Go), puis l'inverse
  au tour suivant. C'est lent, mais c'est le seul moyen d'avoir un avis qui n'est pas
  le modèle en train de se relire.
"""
import json, re
import ollama

# Noms exacts de ollama list. Le :latest de Gemma est obligatoire.
MODELE_CERVEAU = "satgeze/gemma4-12b-uncensored-1m:latest"
MODELE_RELECTEUR = "hf.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-i1-GGUF:Q4_K_M"

MODELE_PLANNER = MODELE_CERVEAU
MODELE_CODER = MODELE_CERVEAU
MODELE_REVIEWER = MODELE_RELECTEUR

# Exemple de forme, pas une liste de fichiers à produire.
# Les fichiers à créer dépendent de l'objectif de l'utilisateur.
SYSTEM_CODER = """Réponds UNIQUEMENT avec un objet JSON. Rien avant, rien après. Pas de ```.

{"pensee": "court", "action": "write_file", "args": {"path": "index.html", "content": "<!doctype html>..."}}

Tu codes dans le dossier déjà ouvert. Un seul outil par tour.
N'appelle set_root que si l'objectif donne un autre chemin que celui déjà actif.
Tu suis l'objectif. Tu n'inventes pas de pages que personne n'a demandées.
Chaque fichier s'écrit une fois. S'il existe déjà, tu passes au suivant, ou done.

Actions :
- write_file (path, content)
- read_file (path)
- delete_file (path)
- list_files ()
- shell (cmd)
- git (args)
- commit_push (message)
- create_github_repo (name, private, description)
- set_root (path)
- clone_repo (url, folder)
- web_search (query)
- github_search (query, search_type)
- x_search (query)
- telegram_search (query)
- trappist_generate (kind, prompt, out_path)
- done (resume)

Dossier vide : write_file tout de suite, jamais done.
done seulement quand l'objectif est atteint.
Pas de discussion. Pas de plan en prose. Pas de brouillon."""

SYSTEM_REVIEWER = """Tu es un reviewer. 2 phrases en français : est-ce que l'action a avancé l'objectif, et quelle est la prochaine correction concrète. Pas de JSON."""

SYSTEM_CHAT = """Tu es l'assistant de TrappistCode.
Réponds en français, 2 à 5 phrases, comme dans une discussion.
Uniquement la réponse finale.
Interdit : plan, brouillon, puces, Persona, Draft, Self-correction, JSON, code."""

# DeepSeek doit répondre dans cette forme, et dans aucune autre.
SYSTEM_CONTROLE = """Tu vérifies un fichier déjà écrit. Tu ne le réécris pas.
Réponds UNIQUEMENT par ce JSON :
{"ok": true, "raison": "court", "suite": "done"}
ok=false seulement s'il manque quelque chose d'essentiel DANS CE FICHIER, par rapport à l'objectif.
suite = done, ou le prochain fichier à créer. Interdit de redemander le fichier qu'on te montre.
Si le fichier est suffisant pour sa part de l'objectif, ok=true. N'invente pas de défauts."""


def _chat(messages: list, num_predict: int, temperature: float, as_json: bool = False, modele: str = "") -> dict:
    """Appelle Ollama. modele vaut Gemma par défaut. Passer MODELE_REVIEWER pour DeepSeek.

    L'échelle d'essais existe parce que les builds Ollama ne supportent pas tous
    format=json ni think=False. On essaie le plus strict, puis on relâche.
    """
    options = {"num_ctx": 12288, "num_predict": num_predict, "temperature": temperature}
    base = {"model": modele or MODELE_CODER, "messages": messages, "options": options}
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
    """Certaines versions Ollama mettent le texte dans thinking si content est vide."""
    msg = reponse.get("message") or {}
    return (msg.get("content") or msg.get("thinking") or "").strip()


def _objet_json(texte: str) -> dict:
    """N'importe quel objet JSON, même sans clé action. Sert au contrôle DeepSeek."""
    if not texte:
        return {}
    texte = re.sub(r"```(?:json)?", "", texte).strip()
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
    """Un ordre d'outil. Ignore les JSON qui n'ont ni action ni plan,
    sinon un avis de contrôle serait exécuté comme une action."""
    data = _objet_json(texte)
    if data.get("action") or data.get("plan"):
        data.setdefault("pensee", "")
        data.setdefault("args", {})
        return data
    return {"pensee": "Pas de JSON", "action": "list_files", "args": {}}


def _coder(prompt: str) -> dict:
    """Un tour de Gemma. Deux essais : le second est plus froid si le premier n'est pas du JSON."""
    messages = [
        {"role": "system", "content": SYSTEM_CODER},
        {"role": "user", "content": prompt + "\n/no_think"},
    ]
    data = extraire_json(_texte(_chat(messages, 4500, 0.2, as_json=True)))
    if data.get("pensee") == "Pas de JSON":
        data = extraire_json(_texte(_chat(messages, 4500, 0.1, as_json=True)))
    return data


def est_discussion(question: str) -> bool:
    """Vrai seulement pour une question, pas pour un ordre de code.
    Un chemin Windows ou un verbe de création force le mode agent."""
    q = question.strip().lower()
    if re.search(r"[a-z]:\\", q):
        return False
    if any(k in q for k in (
        "crée", "cree", "créé", "construis", "ecris", "écris", "fichier",
        "commit", "push", "github", "index.html", "modifie", "ajoute",
        "code", "dossier", "repo", "npm", "bug", "css", "html",
    )):
        return False
    return any(k in q for k in (
        "que dire", "c'est quoi", "c est quoi", "qu'est-ce", "quest-ce",
        "explique", "parle-moi", "parle moi", "ton avis", "tu penses",
        "qui es-tu", "qui es tu",
    ))


def discuter(question: str) -> str:
    """Réponse courte, Gemma seule. Pas d'outil."""
    r = _chat(
        [
            {"role": "system", "content": SYSTEM_CHAT},
            {"role": "user", "content": question.strip() + "\n/no_think"},
        ],
        num_predict=500,
        temperature=0.4,
    )
    texte = _texte(r)
    # Gemma 4 déverse parfois son brouillon (Persona, Draft). On ne garde que le dernier bloc.
    if "Persona:" in texte or "Draft" in texte or "Selected response" in texte:
        parts = [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]
        texte = parts[-1] if parts else texte
        texte = re.sub(r"(?is)^(\*+\s*)?(selected response|réponse)\s*:\s*", "", texte).strip()
    return texte[:1200] or "Je suis là."


def planner(objectif: str, contexte: str) -> dict:
    """Plan optionnel. Gemma aussi, pour ne pas changer de modèle avant d'avoir codé."""
    r = _chat(
        [
            {"role": "system", "content": 'Réponds en JSON : {"pensee":"...","plan":["étape 1","étape 2"]}'},
            {"role": "user", "content": f"OBJECTIF : {objectif}\n\nCONTEXTE :\n{contexte[:3000]}\n/no_think"},
        ],
        num_predict=600,
        temperature=0.2,
        as_json=True,
        modele=MODELE_PLANNER,
    )
    return extraire_json(_texte(r))


def decider(objectif: str, historique: list, contexte: str) -> dict:
    """Prochaine action. Salutation et question simple s'arrêtent ici, sans outil."""
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
    prompt = (
        f"OBJECTIF : {objectif}\n\n"
        f"FICHIERS :\n{contexte[:1800] or '(dossier vide)'}\n\n"
        f"HISTORIQUE :\n{hist}\n\n"
        f"Un seul JSON. Si le dossier est vide, write_file."
        f"{lecture}"
    )
    data = _coder(prompt)
    vide = not contexte.strip() or contexte.strip() == "(dossier vide)"
    if vide and not historique and data.get("action") != "write_file":
        data = _coder(prompt + "\n\nInterdit de répondre done. Écris le premier fichier maintenant.")
    return data


def verifier(objectif: str, action: dict, resultat: str) -> str:
    """Commentaire court pour le journal du tour. Ne relit pas le fichier entier.
    Sur un OK évident on ne charge pas DeepSeek : ça éviterait un aller-retour VRAM pour rien."""
    debut = (resultat or "").lstrip()
    if debut.startswith(("OK ", "Dossier de travail", "Commit local", "Commit:")) and "Erreur" not in debut[:80]:
        return "Action réussie. Continuer vers la prochaine étape concrète."
    r = _chat(
        [
            {"role": "system", "content": SYSTEM_REVIEWER},
            {"role": "user", "content": f"Objectif : {objectif[:500]}\nAction : {action.get('action')}\nRésultat : {resultat[:800]}\n/no_think"},
        ],
        num_predict=120,
        temperature=0.2,
        modele=MODELE_REVIEWER,
    )
    return _texte(r) or "Résultat reçu."


def _oui(valeur) -> bool:
    """DeepSeek écrit parfois ok comme le texte 'true' ou 'oui', pas comme un booléen."""
    if isinstance(valeur, bool):
        return valeur
    if isinstance(valeur, str):
        return valeur.strip().lower() in ("true", "1", "oui", "yes", "ok")
    return bool(valeur)


def controler(objectif: str, chemin: str, contenu: str) -> dict:
    """DeepSeek juge le fichier. Appelé par la boucle après un write_file réussi.

    Retour :
    - ok True  : le fichier est gardé et verrouillé. On ne le réécrit plus.
    - ok False : une seule correction est autorisée, puis la boucle verrouille quand même.
    - JSON illisible : on garde le fichier. Mieux vaut un fichier moyen qu'une boucle de réécriture.
    """
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
        modele=MODELE_REVIEWER,
    )
    data = _objet_json(_texte(r))
    if "ok" not in data:
        return {"ok": True, "raison": "avis illisible, on garde le fichier", "suite": "done"}
    return {
        "ok": _oui(data.get("ok")),
        "raison": str(data.get("raison", ""))[:300],
        "suite": str(data.get("suite") or "done")[:200],
    }


import os, urllib.request

MODELE_KIMI = "moonshotai/kimi-k2.7-code"


def _cle_wavespeed() -> str:
    for nom in ("WAVESPEED_API_KEY", "VITE_WAVESPEED_KEY"):
        if os.environ.get(nom):
            return os.environ[nom].strip().strip('"')
    env = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.isfile(env):
        for ligne in open(env, encoding="utf-8"):
            if ligne.startswith("VITE_WAVESPEED_KEY=") or ligne.startswith("WAVESPEED_API_KEY="):
                return ligne.split("=", 1)[1].strip().strip('"')
    return ""


def secours_kimi(objectif: str, historique: list, contexte: str, raison: str) -> dict:
    """Kimi K2.7 Code. Uniquement si Gemma n'a pas produit une action utilisable."""
    cle = _cle_wavespeed()
    if not cle:
        return {"pensee": "pas de clé", "action": "done", "args": {"resume": "Kimi non appelé : clé WaveSpeed absente du .env."}}
    hist = "\n".join(f"- {a} => {str(r)[:250]}" for a, r in historique[-6:]) or "(début)"
    body = json.dumps({
        "model": MODELE_KIMI,
        "temperature": 0.2,
        "max_tokens": 4096,
        "messages": [
            {"role": "system", "content": SYSTEM_CODER},
            {"role": "user", "content": (
                f"Le modèle local est bloqué : {raison}\n\n"
                f"OBJECTIF : {objectif[:1500]}\n\n"
                f"FICHIERS :\n{contexte[:1500]}\n\n"
                f"HISTORIQUE :\n{hist}\n\n"
                "Donne la prochaine action. Un seul JSON."
            )},
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
        return {"pensee": "kimi en erreur", "action": "done", "args": {"resume": f"Kimi injoignable : {e}"}}
    return extraire_json(texte)
