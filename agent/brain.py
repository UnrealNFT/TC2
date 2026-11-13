# pyright: reportMissingImports=false

"""Cerveau multi-agents de TrappistCode : Planner → Coder → Reviewer."""
import json, re
import ollama

MODELE_PLANNER = "huihui_ai/qwen3-abliterated:8b"
MODELE_CODER = "hf.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-i1-GGUF:Q4_K_M"
MODELE_REVIEWER = "huihui_ai/qwen3-abliterated:8b"

SYSTEM_PLANNER = """Tu es un architecte logiciel expert.
Analyse l'objectif et le contexte du projet.
Propose un plan clair en étapes courtes et précises.
Réponds en JSON : {"pensee": "...", "plan": ["étape 1", "étape 2", ...]}"""

SYSTEM_CODER = """IMPORTANT : Réponds UNIQUEMENT avec un objet JSON valide. Rien avant, rien après. Pas de ```json.

Exemple :
{"pensee": "Je crée le fichier", "action": "write_file", "args": {"path": "index.html", "content": "<html>..."}}

Tu es un agent de code autonome (TrappistCode).
Un seul outil par tour.

Actions possibles :
- write_file (path, content)
- read_file (path)
- delete_file (path)
- list_files
- shell (cmd)
- git (args)
- commit_push (message)
- create_github_repo (name, private, description)
- set_root (path)
- clone_repo (url, folder)
- web_search (query)
- github_search (query)
- trappist_generate (kind, prompt, out_path)
- done (resume)

Si l'utilisateur donne un chemin Windows (C:\\...), utilise set_root.
Si c'est une vraie tâche, agis. Si c'est une salutation courte, réponds avec done.
Sois précis et autonome."""

SYSTEM_REVIEWER = """Tu es un reviewer exigeant.
On te donne une action et son résultat.
Dis en 2-3 phrases si ça avance l'objectif, s'il y a une erreur, et ce qu'il faut corriger.
Réponds en français, concis."""


def extraire_json(texte: str) -> dict:
    texte = texte.strip()
    # Nettoie les éventuels blocs markdown
    texte = re.sub(r"```json\s*|\s*```", "", texte)
    
    m = re.search(r"\{.*\}", texte, re.DOTALL)
    if not m:
        return {
            "pensee": "Pas de JSON détecté",
            "action": "done",
            "args": {"resume": texte[:600] or "Réponse vide"}
        }
    try:
        data = json.loads(m.group(0))
        # Sécurité : force une action valide
        if "action" not in data:
            data["action"] = "done"
            data.setdefault("args", {"resume": "Action manquante"})
        return data
    except json.JSONDecodeError:
        return {
            "pensee": "JSON invalide",
            "action": "done",
            "args": {"resume": texte[:600]}
        }


def planner(objectif: str, contexte: str) -> dict:
    prompt = f"OBJECTIF : {objectif}\n\nCONTEXTE PROJET :\n{contexte[:3000]}\n\nFais un plan clair."
    r = ollama.chat(
        model=MODELE_PLANNER,
        messages=[{"role": "system", "content": SYSTEM_PLANNER},
                  {"role": "user", "content": prompt}],
        options={"num_ctx": 8192, "temperature": 0.2},
    )
    return extraire_json(r["message"]["content"])


def decider(objectif: str, historique: list, contexte: str) -> dict:
    msg = objectif.strip().lower()

    if len(msg) < 12 and any(w in msg for w in ["yo", "salut", "bonjour", "hey", "coucou", "hello"]):
        return {
            "pensee": "Salutation",
            "action": "done",
            "args": {"resume": "Yo ! Je suis là. Qu'est-ce que tu veux qu'on fasse ?"}
        }

    hist = "\n".join(f"- {a} => {str(r)[:350]}" for a, r in historique[-8:]) or "(début)"
    prompt = (
        f"OBJECTIF : {objectif}\n\n"
        f"CONTEXTE :\n{contexte[:1800]}\n\n"
        f"HISTORIQUE :\n{hist}\n\n"
        f"Réponds avec UN SEUL JSON valide. Agis si c'est une tâche."
    )

    r = ollama.chat(
        model=MODELE_CODER,
        messages=[{"role": "system", "content": SYSTEM_CODER},
                  {"role": "user", "content": prompt}],
        options={"num_ctx": 8192, "temperature": 0.25},
    )
    return extraire_json(r["message"]["content"])


def verifier(objectif: str, action: dict, resultat: str) -> str:
    prompt = (
        f"Objectif : {objectif}\n"
        f"Action : {action}\n"
        f"Résultat : {resultat[:1200]}\n\n"
        f"Ça avance ? Erreur à corriger ? (2-3 phrases)"
    )
    r = ollama.chat(
        model=MODELE_REVIEWER,
        messages=[{"role": "system", "content": SYSTEM_REVIEWER},
                  {"role": "user", "content": prompt}],
        options={"num_ctx": 4096, "temperature": 0.2},
    )
    return r["message"]["content"]