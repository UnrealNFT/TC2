"""Trio Kimi -> Gemma/DeepSeek -> juge (étape 2b).

Module branché par agent/__init__.py. Il enveloppe loop sans réécrire loop.py :
- plan Kimi au départ (critères testables), dans le budget ;
- juge (judge.check_criteria) avant chaque done ;
- revue finale Kimi toujours faite, hors budget.
"""
import json

from . import brain, judge, loop, tools

ETAT = {"budget": None, "criteres": [], "refus": 0}

SYSTEM_PLAN = """Tu es Kimi, planificateur. Réponds UNIQUEMENT par ce JSON :
{"plan": ["étape courte", "..."], "criteres": [{"type": "contains", "file": "index.html", "value": "id=\\"hero\\""}]}
Types de critères : contains, not_contains, count (avec n), count_min (avec n), before (avec before).
3 à 8 critères, vérifiables par simple recherche de texte dans les fichiers. Pas de prose."""


def _kimi_json(system: str, user: str) -> dict:
    texte = brain.kimispeak([{"role": "system", "content": system}, {"role": "user", "content": user}])
    return brain._objet_json(texte)


def plan_initial(objectif: str) -> str:
    """Appel Kimi n°1. Renvoie un guidage texte pour Gemma."""
    b = ETAT["budget"]
    if not b or not b.peut("plan"):
        return ""
    b.consommer("plan")
    data = _kimi_json(SYSTEM_PLAN, f"OBJECTIF : {objectif}\n\nCARTE :\n{judge.repo_map()}")
    crit = [c for c in data.get("criteres", []) if isinstance(c, dict)]
    ETAT["criteres"] = crit[:8]
    etapes = data.get("plan", [])
    if not etapes and not crit:
        return ""
    return ("PLAN KIMI :\n" + "\n".join(f"- {e}" for e in etapes[:8])
            + "\nCRITÈRES QUE LE JUGE VÉRIFIERA :\n" + json.dumps(ETAT["criteres"], ensure_ascii=False))


def juge_done() -> tuple[bool, str]:
    """Vrai si le done peut passer. Sans critères : on garde l'ancien comportement."""
    if not ETAT["criteres"]:
        return True, ""
    v = judge.check_criteria(ETAT["criteres"])
    return v["ok"], judge.format_verdict(v)


def revue_finale(objectif: str) -> str:
    """Lecture finale Kimi, hors budget, sur la carte + verdict du juge."""
    b = ETAT["budget"]
    if not b or not b.peut("final"):
        return ""
    b.consommer("final")
    ok, verdict = juge_done()
    return brain.kimi_final_review(objectif, f"CARTE :\n{judge.repo_map()}\n\nJUGE :\n{verdict or 'pas de critères'}")
