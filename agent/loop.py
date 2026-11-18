# pyright: reportMissingImports=false
"""Boucle principale de l'agent : cycles, narration, tests.

Mode SOLO : un seul modèle fait tout (plan, code, tests, relecture).
Mode QUESTION : si l'utilisateur pose une question, l'agent lit le projet,
répond via done(resume) et n'écrit rien.
"""
import json
import os
import re
from typing import Callable

from . import tools
from . import brain
from . import question as q


# Nombre de tours par cycle
CYCLE_SIZE = 10

# Nombre d'échecs edit_file consécutifs sur un même fichier avant d'imposer write_file
MAX_ECHECS_EDIT = 2

# Flag global d'arrêt demandé par l'utilisateur
STOP_FLAG = {"stop": False}

# Actions qui modifient le workspace
ACTIONS_ECRITURE = ("write_file", "edit_file", "append_file", "delete_file", "copy_file", "rename_file", "move_file", "delete", "mkdir")


def request_stop():
    """Appelé par le serveur /agent/stop."""
    STOP_FLAG["stop"] = True


def _was_stopped() -> bool:
    return STOP_FLAG["stop"]


def _a_ecrit(historique: list) -> bool:
    """Vrai si l'agent a modifié au moins un fichier pendant la mission."""
    return any(
        a.get("action") in ACTIONS_ECRITURE and not str(r).startswith("ERREUR")
        for a, r in historique
    )


def _executer_action(action: dict) -> str:
    nom = action.get("action", "done")
    args = action.get("args", {})
    if nom == "done":
        return f"DONE: {args.get('resume', 'Terminé.')}"
    fn = tools.TOOLS.get(nom)
    if not fn:
        return f"ERREUR: action inconnue {nom}"
    try:
        if nom == "shell" and "command" not in args and "cmd" in args:
            args = {"command": args["cmd"]}
        return fn(**args)
    except Exception as e:
        return f"ERREUR: {e}"


def _verrouiller(chemin: str, verrou: set):
    verrou.add(chemin)


def _est_verrouille(chemin: str, verrou: set) -> bool:
    return chemin in verrou


def _narrer(tour: int, cycle: int, action: str, resultat: str, avis: dict = None) -> str:
    if action == "done":
        return "🏁 Mission terminée."
    if action == "write_file":
        if avis:
            suite = avis.get("suite", "fichier")
            if avis.get("ok") is False:
                return f"🛠️ Le modèle voit un défaut : {avis.get('raison', 'relire')}. Suite : {suite}"
            return f"✅ Fichier validé. Prochaine étape : {suite}"
        return "✏️ Écriture du fichier..."
    if action == "edit_file":
        if str(resultat).startswith("ERREUR"):
            return "⚠️ Modification refusée : " + str(resultat).splitlines()[0][:160]
        lignes = str(resultat).splitlines()
        return "✏️ Modification ciblée.\n" + "\n".join(lignes[:16])
    if action == "read_file":
        lignes = len(str(resultat).splitlines())
        return f"👁️ Lecture ({lignes} lignes)."
    if action == "get_context":
        return "🧠 Chargement du contexte projet."
    if action == "list_files":
        return "📁 Liste des fichiers récupérée."
    if action == "list_tree":
        return "🌳 Arborescence projet récupérée."
    if action == "commit_push":
        return "💾 Commit/push effectué."
    if action == "shell":
        return "⚙️ Commande exécutée."
    if action == "test_project":
        return "🧪 Test projet exécuté."
    if action == "test_file":
        return "🧪 Test fichier exécuté."
    if action == "set_root":
        return "📂 Dossier de travail défini."
    return f"▶️ Action : {action}"


CONTINU_DESCRIPTIONS = {
    "website": "Je continue d'ajouter des sections et de polir le site.",
    "game": "J'améliore le jeu : score, niveaux, visuels, bugs.",
    "app": "J'ajoute des fonctionnalités et je corrige les défauts.",
}


def _test_reussi(historique: list) -> bool:
    """Vrai seulement si test_project ou test_file a renvoyé un succès."""
    for action, resultat in historique:
        if action.get("action") not in ("test_project", "test_file"):
            continue
        texte = str(resultat).strip()
        if texte.startswith("ERREUR") or texte.startswith("AUCUN TEST"):
            continue
        return True
    return False


def _verifier_done_valide(objectif: str, historique: list) -> bool:
    """Empêche un done prématuré si des fichiers vitaux semblent manquants ou vides."""
    try:
        ecrits = set()
        for action, _ in historique:
            if action.get("action") in ("write_file", "edit_file"):
                ecrits.add(action.get("args", {}).get("path", "").lower())

        obj = q.message_utilisateur(objectif).lower()
        if "html" in obj or "site" in obj or "jeu" in obj or "game" in obj or "three" in obj:
            if "index.html" not in ecrits and not tools.exists_file("index.html"):
                return False
            contenu = tools.read_file("index.html")
            if not contenu or len(contenu.strip()) < 50:
                return False
    except Exception:
        return True
    return True


def _relire_finale(objectif: str, model_key: str, max_fix: int = 3) -> int:
    """Relecture finale automatique : lit les fichiers et corrige si vide ou cassé."""
    if _was_stopped():
        return 0
    fichiers = []
    for nom in tools.list_tree().splitlines():
        nom = nom.strip()
        if nom and not nom.endswith("/") and any(nom.lower().endswith(ext) for ext in (".html", ".css", ".js", ".ts", ".tsx", ".py")):
            fichiers.append(nom)

    fixes = 0
    for chemin in fichiers:
        if _was_stopped():
            break
        contenu = tools.read_file(chemin)
        if not contenu or len(contenu.strip()) < 10:
            action = brain.decider(
                objectif,
                [],
                tools.get_context(max_files=10),
                guidance=f"Le fichier {chemin} est vide ou très court. Réécris-le correctement.",
                model_key=model_key,
            )
            if action.get("action") == "write_file":
                _executer_action(action)
                fixes += 1
                if fixes >= max_fix:
                    break
    return fixes


def _callback_safety(callback, tour, decision, narration):
    if callback:
        try:
            callback(tour, decision, narration)
        except Exception as e:
            print(f"[callback error] {e}")


def _essai_decision(objectif, historique, contexte, prompt_sup, model_key: str):
    """Décision du prochain tour, avec le modèle choisi."""
    if _was_stopped():
        return {"pensee": "Arrêt demandé", "action": "done", "args": {"resume": "Arrêt demandé par l'utilisateur."}}
    return brain.decider(objectif, historique, contexte, guidance=prompt_sup, model_key=model_key)


def _page_prete() -> bool:
    """Vrai si index.html est déjà une vraie page, pas un brouillon."""
    try:
        if not tools.exists_file("index.html"):
            return False
        contenu = tools.read_file("index.html") or ""
    except Exception:
        return False
    bas = contenu.lower()
    return len(contenu.strip()) >= 400 and "<body" in bas and "</html>" in bas


def _tour_en_lecture(historique: list) -> bool:
    if len(historique) < 3:
        return False
    recent = [a.get("action") for a, _ in historique[-4:]]
    return all(a in ("read_file", "list_files", "list_tree", "get_context") for a in recent)


def _echecs_edit_consecutifs(historique: list) -> tuple:
    """(chemin, n) : nombre d'edit_file ratés d'affilée sur le même fichier (lectures ignorées)."""
    chemin, n = "", 0
    for action, resultat in reversed(historique):
        nom = action.get("action")
        if nom in ("read_file", "list_files", "list_tree", "get_context"):
            continue
        if nom != "edit_file" or not str(resultat).startswith("ERREUR"):
            break
        p = action.get("args", {}).get("path", "")
        if chemin and p != chemin:
            break
        chemin = p
        n += 1
    return chemin, n


def _detecter_boucle(historique: list) -> str:
    """Renvoie un message si le modèle tourne en rond sur list_files/read_file/shell/edit_file."""
    chemin_ko, n_ko = _echecs_edit_consecutifs(historique)
    if chemin_ko and n_ko >= MAX_ECHECS_EDIT:
        return (
            f"\n\n⚠️ edit_file A ÉCHOUÉ {n_ko} FOIS D'AFFILÉE SUR {chemin_ko}. "
            "N'utilise PLUS edit_file sur ce fichier. "
            f"Utilise write_file avec le contenu COMPLET et corrigé de {chemin_ko}."
        )

    if len(historique) < 4:
        return ""
    recent = historique[-6:]
    actions = [a.get("action") for a, _ in recent]

    if actions.count("list_files") >= 2 or actions.count("read_file") >= 3:
        fichiers = []
        for nom in tools.list_tree().splitlines()[:20]:
            if nom.strip() and not nom.endswith("/"):
                fichiers.append(nom.strip())
        if fichiers:
            return (
                "\n\n⚠️ TU AS DÉJÀ FAIT TROP DE list_files/read_file D'AFFILÉE. "
                "Tu dois AGIR maintenant avec edit_file ou write_file. "
                f"Fichiers existants ({len(fichiers)}) : {', '.join(fichiers[:10])}. "
                "Interdit de relire un fichier déjà lu. Si la page est déjà bonne, action done."
            )

    if actions.count("shell") >= 3:
        derniers_resultats = [str(r) for _, r in historique[-3:]]
        if any(r.startswith("ERREUR") for r in derniers_resultats):
            return (
                "\n\n⚠️ TU AS FAIT TROP DE shell QUI ÉCHOUENT. "
                "Arrête shell. Si l'objectif est atteint, appelle done. Sinon fais edit_file/read_file."
            )

    ecrits = [a.get("args", {}).get("path", "") for a, _ in recent if a.get("action") in ("write_file", "edit_file")]
    if len(ecrits) >= 3 and len(set(ecrits)) == 1:
        return (
            f"\n\n⚠️ TU RÉÉCRIS LE MÊME FICHIER ({ecrits[-1]}) SANS ARRÊT. "
            "Soit il est bon et tu passes à autre chose, soit tu appelles done."
        )

    return ""


def _run_cycle(
    objectif: str,
    historique: list,
    verrou: set,
    start_tour: int,
    start_cycle: int,
    callback: Callable,
    max_tours: int,
    continu: bool,
    description_continu: str,
    model_key: str,
):
    tour_abs = start_tour
    for tour_in_cycle in range(1, CYCLE_SIZE + 1):
        tour_abs = start_tour + tour_in_cycle - 1
        if tour_abs > max_tours or _was_stopped():
            break

        contexte = tools.get_context(max_files=30)

        prompt_sup = ""
        if continu:
            prompt_sup = (
                f"\n\nMODE CONTINU : {description_continu}. "
                "N'appelle jamais done. Continue à enrichir le projet déjà existant."
            )
        elif tour_abs >= max_tours - 2:
            prompt_sup = (
                f"\n\n⏱️ IL TE RESTE {max_tours - tour_abs + 1} TOUR(S). "
                "Termine l'essentiel puis appelle done avec un résumé honnête de ce qui est fait et de ce qui reste."
            )

        anti_boucle = _detecter_boucle(historique)
        if anti_boucle:
            prompt_sup += anti_boucle

        if _tour_en_lecture(historique) and _page_prete():
            decision = {
                "pensee": "La page est déjà construite. Inutile de la relire.",
                "action": "done",
                "args": {"resume": "Site déjà en place. J'arrête de relire index.html."},
            }
        else:
            decision = _essai_decision(objectif, historique, contexte, prompt_sup, model_key)

        # Garde-fou dur : edit_file interdit sur un fichier où il vient d'échouer plusieurs fois
        chemin_ko, n_ko = _echecs_edit_consecutifs(historique)
        if (
            decision.get("action") == "edit_file"
            and n_ko >= MAX_ECHECS_EDIT
            and decision.get("args", {}).get("path", "") == chemin_ko
        ):
            resultat_bloque = (
                f"ERREUR: edit_file bloqué sur {chemin_ko} après {n_ko} échecs. "
                f"Utilise write_file avec le contenu complet de {chemin_ko}."
            )
            historique.append((decision, resultat_bloque))
            _callback_safety(callback, tour_abs, decision, f"🚧 edit_file bloqué sur {chemin_ko} : réécriture complète demandée.")
            continue

        if decision.get("action") in ("write_file", "edit_file"):
            chemin = decision.get("args", {}).get("path", "")
            if chemin and _est_verrouille(chemin, verrou):
                decision["pensee"] = f"{chemin} déjà validé. Je passe au suivant."
                decision["action"] = "list_files"
                decision["args"] = {}

        # done refusé seulement si l'agent a écrit des fichiers sans les tester
        if decision.get("action") == "done" and _a_ecrit(historique) and not _page_prete():
            if not _test_reussi(historique):
                decision["pensee"] = "done refusé: aucun test réussi."
                decision["action"] = "test_project"
                decision["args"] = {}
            elif not _verifier_done_valide(objectif, historique):
                decision["pensee"] = "Travail incomplet. Je lis au lieu de terminer."
                decision["action"] = "read_file"
                decision["args"] = {"path": "index.html"}

        if decision.get("action") == "list_files" and historique and historique[-1][0].get("action") == "list_files":
            resultat = "ERREUR: déjà listé. Lis un fichier ou modifie."
        else:
            resultat = _executer_action(decision)

        if decision.get("action") == "write_file":
            chemin = decision.get("args", {}).get("path", "")
            if chemin and chemin.lower().endswith("index.html"):
                racine = chemin.rsplit("/", 1)[0]
                if racine and tools.exists_file(chemin):
                    try:
                        tools.copy_file(chemin, "index.html")
                    except Exception:
                        pass

        avis = None
        if decision.get("action") == "write_file" and not str(resultat).startswith("ERREUR"):
            chemin = decision.get("args", {}).get("path", "")
            if chemin:
                contenu = tools.read_file(chemin)
                avis = brain.controler(objectif, chemin, contenu, model_key=model_key)
                _verrouiller(chemin, verrou)

        narration = _narrer(tour_abs, start_cycle, decision.get("action", "?"), resultat, avis)

        historique.append((decision, resultat))
        _log({"tour": tour_abs, "cycle": start_cycle, "action": decision.get("action"), "args": decision.get("args"),
              "resultat": (str(resultat)[:300] + "..." if len(str(resultat)) > 300 else str(resultat)),
              "pensee": narration})
        _callback_safety(callback, tour_abs, decision, narration)

        if decision.get("action") == "done":
            return True, tour_abs, False

    return False, tour_abs, _was_stopped()


def _repondre_question(objectif: str, callback: Callable, model_key: str):
    """Mode question : 1 appel modèle, lecture du projet, aucune écriture."""
    try:
        contexte = tools.get_context(max_files=30)
    except Exception as e:
        contexte = f"(projet illisible : {e})"
    decision = q.repondre_sur_projet(objectif, contexte, model_key=model_key)
    _log({"tour": 1, "cycle": 1, "action": "done", "mode": "question", "resultat": decision["args"]["resume"][:300]})
    _callback_safety(callback, 1, decision, "💬 Réponse (aucun fichier modifié).")


def _fichiers_modifies(historique: list) -> list:
    vus = []
    for a, r in historique:
        if a.get("action") in ("write_file", "edit_file") and not str(r).startswith("ERREUR"):
            p = a.get("args", {}).get("path", "")
            if p and p not in vus:
                vus.append(p)
    return vus


def boucle(
    objectif: str,
    max_tours: int = 20,
    commit_chaque: int = 5,
    callback: Callable = None,
    continu: bool = False,
    model_key: str = "gemma",
):
    STOP_FLAG["stop"] = False
    message = q.message_utilisateur(objectif)

    # Chemin donné dans le message de l'utilisateur (pas dans le CONTEXTE)
    m = re.search(r"[A-Za-z]:\\[^\r\n\"']+", message)
    if m:
        tools.initialize_root(m.group(0).strip().split()[0].rstrip("\\.,;:"))

    # Question => réponse directe, jamais de write
    if not continu and q.est_question(objectif):
        _repondre_question(objectif, callback, model_key)
        return

    historique = []
    verrou = set()

    obj = message.lower()
    description_continu = "j'ajoute des fonctionnalités au projet"
    for mot, desc in CONTINU_DESCRIPTIONS.items():
        if mot in obj:
            description_continu = desc
            break

    tour_courant = 1
    termine = False
    cycle = 1

    while tour_courant <= max_tours and not termine:
        if STOP_FLAG["stop"]:
            break

        termine, dernier_tour, stopped = _run_cycle(
            objectif, historique, verrou, tour_courant, cycle, callback,
            max_tours, continu, description_continu, model_key=model_key,
        )
        if stopped:
            break

        if not termine:
            cycle += 1
            tour_courant = dernier_tour + 1

        # Commit auto tous les N tours, seulement si des fichiers ont changé
        if _a_ecrit(historique) and tour_courant % commit_chaque == 0 and termine is False:
            try:
                msg = f"agent: tour {tour_courant}"
                res = tools.commit_push(msg)
                _callback_safety(callback, tour_courant, {"action": "commit_push", "args": {"message": msg}}, f"💾 {res[:100]}")
            except Exception as e:
                print(f"[commit auto] {e}")

    if _was_stopped():
        _callback_safety(callback, 0, {"action": "stop", "args": {}}, "🛑 Mission arrêtée par l'utilisateur.")
        return

    limite_atteinte = not termine and not continu
    modifies = _fichiers_modifies(historique)

    # Rien n'a été écrit : la réponse du done suffit, sauf si la limite a coupé l'agent.
    if not _a_ecrit(historique):
        if limite_atteinte:
            _callback_safety(
                callback, 0, {"action": "summary", "args": {}},
                f"⏱️ Limite de {max_tours} tours atteinte sans terminer. Aucun fichier modifié. "
                "Reformule la demande ou augmente max_tours.",
            )
        return

    fixes = _relire_finale(objectif, model_key)
    if fixes:
        _log({"tour": 0, "cycle": cycle, "action": "final_review", "pensee": f"Relecture finale : {fixes} fichier(s) corrigé(s)."})

    liste = ", ".join(modifies[:8]) if modifies else "aucun"
    if limite_atteinte:
        final_msg = (
            f"⏱️ Limite de {max_tours} tours atteinte : l'agent n'a PAS terminé la mission. "
            f"Fichiers modifiés : {liste}. Relance l'agent pour qu'il continue."
        )
    elif _test_reussi(historique):
        final_msg = f"Mission terminée. Un test a réussi. Fichiers modifiés : {liste}."
    else:
        final_msg = f"Fichiers modifiés ({liste}), mais aucun test n'a réussi."
    # action "summary" (pas "done") : n'écrase pas la réponse de l'agent côté backend
    _callback_safety(callback, 0, {"action": "summary", "args": {"limite": limite_atteinte}}, f"Résumé final : {final_msg}")


def _log(data: dict):
    try:
        print(json.dumps(data, ensure_ascii=False))
    except Exception:
        print(data)
