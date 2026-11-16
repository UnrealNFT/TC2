"""Branchement du trio sur loop/brain sans réécrire ces fichiers (étapes 2b + 2c).

Importé par agent/__init__.py. Remplace à chaud :
- loop.boucle        : budget Kimi + plan Kimi (critères) au départ
- loop._run_cycle    : corrige le retour 4 valeurs -> 3 attendues par boucle
- loop._essai_decision : ajoute le plan au prompt, le juge refuse les done ratés
- loop._page_prete   : une "page prête" doit aussi passer le juge
- brain.decider      : supprime le done imposé après des lectures
- brain.kimi_supervise : revue tour 10 comptée dans le budget
- brain.kimi_final_review : lecture finale toujours faite (carte + verdict)
"""
import re

from . import brain, judge, loop, tools, trio

MAX_REFUS = 4  # au-delà, le juge laisse passer pour éviter une boucle infinie

_orig = {
    "boucle": loop.boucle,
    "run_cycle": loop._run_cycle,
    "essai": loop._essai_decision,
    "page_prete": loop._page_prete,
    "decider": brain.decider,
    "supervise": brain.kimi_supervise,
    "final": brain.kimi_final_review,
}


def _juge_bloque() -> tuple:
    if trio.ETAT.get("refus", 0) >= MAX_REFUS:
        return False, ""
    ok, verdict = trio.juge_done()
    return (not ok), verdict


def _outil_juge(**_) -> str:
    return judge.format_verdict(judge.check_criteria(trio.ETAT.get("criteres", [])))


def boucle(objectif, *a, **kw):
    trio.ETAT.update(budget=judge.BudgetKimi(), criteres=[], refus=0, plan="")
    m = re.search(r"[A-Za-z]:\\[^\r\n\"']+", objectif or "")
    if m:
        judge.set_root(m.group(0).strip().split()[0])
    try:
        trio.ETAT["plan"] = trio.plan_initial(objectif)
    except Exception as e:
        print(f"[trio] plan Kimi ko : {e}")
    return _orig["boucle"](objectif, *a, **kw)


def _run_cycle(*a, **kw):
    r = _orig["run_cycle"](*a, **kw)
    if isinstance(r, tuple) and len(r) == 4:
        return (r[0] or r[3]), r[1], r[2]
    return r


def _essai_decision(objectif, historique, contexte, prompt_sup, kimi_only=False):
    if trio.ETAT.get("plan"):
        prompt_sup = (prompt_sup or "") + "\n\n" + trio.ETAT["plan"]
    d = _orig["essai"](objectif, historique, contexte, prompt_sup, kimi_only=kimi_only)
    if d.get("action") == "done":
        bloque, _ = _juge_bloque()
        if bloque:
            trio.ETAT["refus"] = trio.ETAT.get("refus", 0) + 1
            return {"pensee": "done refusé par le juge. Je corrige les critères ❌.", "action": "juge", "args": {}}
    return d


def _page_prete() -> bool:
    if not _orig["page_prete"]():
        return False
    bloque, _ = _juge_bloque()
    return not bloque


def decider(objectif, historique, contexte, guidance=""):
    d = _orig["decider"](objectif, historique, contexte, guidance=guidance)
    if str(d.get("pensee", "")).startswith("Assez lu"):
        return {
            "pensee": "Assez lu. Je vérifie au lieu de m'arrêter.",
            "action": "juge" if trio.ETAT.get("criteres") else "test_project",
            "args": {},
        }
    return d


def kimi_supervise(*a, **kw):
    b = trio.ETAT.get("budget")
    if not b or not b.peut("revue"):
        return ""
    b.consommer("revue")
    return _orig["supervise"](*a, **kw)


def kimi_final_review(objectif, contenu=""):
    b = trio.ETAT.get("budget")
    if b and b.max <= 0:
        return ""
    if b:
        b.consommer("final")
    _, verdict = trio.juge_done()
    return _orig["final"](objectif, f"CARTE :\n{judge.repo_map()}\n\nJUGE :\n{verdict or 'pas de critères'}")


loop.boucle = boucle
loop._run_cycle = _run_cycle
loop._essai_decision = _essai_decision
loop._page_prete = _page_prete
brain.decider = decider
brain.kimi_supervise = kimi_supervise
brain.kimi_final_review = kimi_final_review
tools.TOOLS["juge"] = _outil_juge
