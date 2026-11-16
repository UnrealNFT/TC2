# pyright: reportMissingImports=false
"""Boucle principale de l'agent : cycles, narration, tests.

Mode SOLO : un seul modèle fait tout (plan, code, tests, relecture).
Aucun relais automatique vers Kimi ou un autre modèle.
"""
import json
import os
import re
from typing import Callable

from . import tools
from . import brain
from . import memory


# Nombre de tours par cycle
CYCLE_SIZE = 10

# Flag global d'arrêt demandé par l'utilisateur
STOP_FLAG = {"stop": False}


def request_stop():
    """Appelé par le serveur /agent/stop."""
    STOP_FLAG["stop"] = True


def _was_stopped() -> bool:
    return STOP_FLAG["stop"]


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
    ecrits = set()
    for action, _ in historique:
        if action.get("action") in ("write_file", "edit_file"):
            ecrits.add(action.get("args", {}).get("path", "").lower())

    obj = objectif.lower()
    if "html" in obj or "site" in obj or "jeu" in obj or "game" in obj or "three" in obj:
        if "index.html" not in ecrits and not tools.exists_file("index.html"):
            return False
        contenu = tools.read_file("index.html")
        if not contenu or len(contenu.strip()) < 50:
            return False

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
    if not tools.exists_file("index.html"):
        return False
    contenu = tools.read_file("index.html") or ""
    bas = contenu.lower()
    return len(contenu.strip()) >= 400 and "<body" in bas and "</html>" in bas


def _tour_en_lecture(historique: list) -> bool:
    if len(historique) < 3:
        return False
    recent = [a.get("action") for a, _ in historique[-4:]]
    return all(a in ("read_file", "list_files", "list_tree", "get_context") for a in recent)


def _detecter_boucle(historique: list) -> str:
    """Renvoie un message si le modèle tourne en rond sur list_files/read_file/shell."""
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
                "Si tu veux corriger un fichier existant, utilise edit_file(path, old_string, new_string). "
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
    for tour_in_cycle in range(1, CYCLE_SIZE + 1):
        tour_abs = start_tour + tour_in_cycle - 1
        if tour_abs > max_tours or _was_stopped():
            break

        if STOP_FLAG["stop"]:
            _callback_safety(callback, tour_abs, {"action": "done", "args": {}}, "🛑 Arrêt demandé.")
            return True, tour_abs, True

        contexte = tools.get_context(max_files=30)

        prompt_sup = ""
        if continu:
            prompt_sup = (
                f"\n\nMODE CONTINU : {description_continu}. "
                "N'appelle jamais done. Continue à enrichir le projet déjà existant."
            )

        # Injection mémoire : derniers retours sur cette mission
        feedbacks = memory.get_latest_kimi_feedback(objectif, limit=3)
        if feedbacks:
            prompt_sup += "\n\nDERNIERS CONSEILS MÉMORISÉS :\n"
            for tour, fichier, erreur, conseil in feedbacks:
                prompt_sup += f"- tour {tour} [{fichier}] erreur={erreur[:100]} ; conseil={conseil[:250]}\n"
            prompt_sup += "Applique ces conseils si pertinent.\n"

        # Détection anti-boucle
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

        # Empêcher les actions inutiles sur fichiers verrouillés
        if decision.get("action") in ("write_file", "edit_file"):
            chemin = decision.get("args", {}).get("path", "")
            if chemin and _est_verrouille(chemin, verrou):
                decision["pensee"] = f"{chemin} déjà validé. Je passe au suivant."
                decision["action"] = "list_files"
                decision["args"] = {}

        # Bloquer un done prématuré, sauf si la page est déjà une vraie page
        if decision.get("action") == "done" and not _page_prete():
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

        # Normalise index.html -> racine si besoin
        if decision.get("action") == "write_file":
            chemin = decision.get("args", {}).get("path", "")
            if chemin and chemin.lower().endswith("index.html"):
                racine = chemin.rsplit("/", 1)[0]
                if racine and tools.exists_file(chemin):
                    try:
                        tools.copy_file(chemin, "index.html")
                    except Exception:
                        pass

        # Le modèle vérifie son propre fichier après write_file (solo)
        avis = None
        if decision.get("action") == "write_file" and not str(resultat).startswith("ERREUR"):
            chemin = decision.get("args", {}).get("path", "")
            if chemin:
                contenu = tools.read_file(chemin)
                avis = brain.controler(objectif, chemin, contenu, model_key=model_key)
                _verrouiller(chemin, verrou)
                suite = avis.get("suite", "done")
                if suite.lower() == chemin.lower():
                    suite = ""

                if avis.get("ok") is False:
                    prompt_sup = (
                        f"Le fichier {chemin} a un défaut : {avis.get('raison')}. "
                        "Corrige immédiatement ce fichier en utilisant edit_file."
                    )

        narration = _narrer(tour_abs, start_cycle, decision.get("action", "?"), resultat, avis)

        historique.append((decision, resultat))
        _log({"tour": tour_abs, "cycle": start_cycle, "action": decision.get("action"), "args": decision.get("args"),
              "resultat": (str(resultat)[:300] + "..." if len(str(resultat)) > 300 else str(resultat)),
              "pensee": narration})
        _callback_safety(callback, tour_abs, decision, narration)

        if decision.get("action") == "done":
            return True, tour_abs, False

    return False, tour_abs, _was_stopped()


def boucle(
    objectif: str,
    max_tours: int = 20,
    commit_chaque: int = 5,
    callback: Callable = None,
    continu: bool = False,
    model_key: str = "gemma",
):
    historique = []
    verrou = set()

    obj = objectif.lower()
    description_continu = "j'ajoute des fonctionnalités au projet"
    for mot, desc in CONTINU_DESCRIPTIONS.items():
        if mot in obj:
            description_continu = desc
            break

    chemin = objectif
    if isinstance(chemin, str):
        import re
        m = re.search(r"[A-Za-z]:\\[^\r\n\"']+", chemin)
        if m:
            tools.initialize_root(m.group(0).strip().split()[0].rstrip("\\.,;:"))

    tour_courant = 1
    termine = False
    cycle = 1

    # Reset stop flag au démarrage
    STOP_FLAG["stop"] = False

    # Initialisation mémoire
    memory.init()

    while tour_courant <= max_tours and not termine:
        if STOP_FLAG["stop"]:
            break

        termine, dernier_tour, stopped = _run_cycle(
            objectif,
            historique,
            verrou,
            tour_courant,
            cycle,
            callback,
            max_tours,
            continu,
            description_continu,
            model_key=model_key,
        )
        if stopped:
            break

        if not termine:
            cycle += 1
            tour_courant = dernier_tour + 1

        # Commit auto tous les N tours
        if tour_courant % commit_chaque == 0 and termine is False:
            try:
                msg = f"agent: tour {tour_courant}"
                res = tools.commit_push(msg)
                _callback_safety(callback, tour_courant, {"action": "commit_push", "args": {"message": msg}}, f"💾 {res[:100]}")
            except Exception as e:
                print(f"[commit auto] {e}")

    # Si arrêt demandé, on s'arrête immédiatement
    if _was_stopped():
        final_msg = "Mission arrêtée par l'utilisateur."
        if callback:
            _callback_safety(callback, 0, {"action": "done", "args": {}}, f"🛑 {final_msg}")
        return

    # Relecture finale optionnelle
    fixes = _relire_finale(objectif, model_key)
    if fixes:
        _log({"tour": 0, "cycle": cycle, "action": "final_review", "pensee": f"Relecture finale : {fixes} fichier(s) corrigé(s)."})

    # Le mot ok ne termine pas la mission. Seul un test réussi compte.
    test_ok = _test_reussi(historique)
    if _was_stopped():
        final_msg = "Mission arrêtée par l'utilisateur."
    elif test_ok:
        final_msg = "Mission terminée. Un test a réussi."
    else:
        final_msg = "Arrêt sans test réussi. done refusé."

    if callback:
        _callback_safety(callback, 0, {"action": "done", "args": {}}, f"Résumé final : {final_msg}")


def _log(data: dict):
    try:
        print(json.dumps(data, ensure_ascii=False))
    except Exception:
        print(data)
