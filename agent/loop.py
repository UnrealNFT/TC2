# pyright: reportMissingImports=false
"""Boucle principale de l'agent : cycles, DeepSeek, Gemma, Kimi, narration."""
import json
import os
from typing import Callable

from . import tools
from . import brain


# Nombre de tours par cycle
CYCLE_SIZE = 10

# Flag global d'arrêt demandé par l'utilisateur
STOP_FLAG = {"stop": False}


def request_stop():
    """Appelé par le serveur /agent/stop."""
    STOP_FLAG["stop"] = True


def _executer_action(action: dict) -> str:
    nom = action.get("action", "done")
    args = action.get("args", {})
    if nom == "done":
        return f"DONE: {args.get('resume', 'Terminé.')}"
    fn = tools.TOOLS.get(nom)
    if not fn:
        return f"ERREUR: action inconnue {nom}"
    try:
        # Alias cmd -> command pour l'outil shell
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
            if avis.get("gemma_ok") is False:
                return f"🛠️ DeepSeek OK, Gemma voit un défaut : {avis.get('gemma_raison', 'relire')}. Suite : {suite}"
            return f"✅ Fichier validé (DeepSeek + Gemma). Prochaine étape : {suite}"
        return "✏️ Écriture du fichier..."
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
    if action == "set_root":
        return "📂 Dossier de travail défini."
    if action == "kimi":
        return "🌙 Supervisor Kimi appelé."
    return f"▶️ Action : {action}"


CONTINU_DESCRIPTIONS = {
    "website": "Je continue d'ajouter des sections et de polir le site.",
    "game": "J'améliore le jeu : score, niveaux, visuels, bugs.",
    "app": "J'ajoute des fonctionnalités et je corrige les défauts.",
}


def _verifier_done_valide(objectif: str, historique: list) -> bool:
    """Empêche un done prématuré si des fichiers vitaux semblent manquants ou vides."""
    ecrits = set()
    for action, _ in historique:
        if action.get("action") == "write_file":
            ecrits.add(action.get("args", {}).get("path", "").lower())

    obj = objectif.lower()
    if "html" in obj or "site" in obj or "jeu" in obj or "game" in obj or "three" in obj:
        if "index.html" not in ecrits:
            return False
        contenu = tools.read_file("index.html")
        if not contenu or len(contenu.strip()) < 50:
            return False

    return True


def _relire_finale(objectif: str, max_fix: int = 3) -> int:
    """Relecture finale automatique : lit les fichiers et corrige si vide ou cassé."""
    fichiers = []
    for nom in tools.list_tree().splitlines():
        nom = nom.strip()
        if nom and not nom.endswith("/") and any(nom.lower().endswith(ext) for ext in (".html", ".css", ".js", ".ts", ".tsx", ".py")):
            fichiers.append(nom)

    fixes = 0
    for chemin in fichiers:
        contenu = tools.read_file(chemin)
        if not contenu or len(contenu.strip()) < 10:
            action = brain.decider(
                objectif,
                [],
                tools.get_context(max_files=10),
                guidance=f"Le fichier {chemin} est vide ou très court. Réécris-le correctement.",
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


def _essai_decision(objectif, historique, contexte, prompt_sup, kimi_only: bool = False):
    """Décision du prochain tour, avec option fallback complet sur Kimi."""
    if kimi_only:
        try:
            fallback = brain.secours_kimi(
                f"OBJECTIF : {objectif}\n\nFICHIERS :\n{contexte[:1800]}\n\n"
                f"Ollama est indisponible. Donne la prochaine action JSON."
            )
            fallback["pensee"] = "[Kimi only] " + fallback.get("pensee", "")
            return fallback
        except Exception:
            pass
    try:
        return brain.decider(objectif, historique, contexte, guidance=prompt_sup)
    except Exception as e:
        err = str(e).lower()
        if "prediction aborted" in err or "token repeat" in err or "repeat limit" in err or "context length" in err:
            print(f"[loop] Ollama ko, fallback Kimi : {e}")
            fallback = brain.secours_kimi(
                f"OBJECTIF : {objectif}\n\nFICHIERS :\n{contexte[:1800]}\n\n"
                f"Ollama est bloqué. Donne la prochaine action JSON."
            )
            fallback["pensee"] = "[Kimi fallback] " + fallback.get("pensee", "")
            return fallback
        raise


def _detecter_boucle(historique: list) -> str:
    """Renvoie un message si le modèle tourne en rond sur list_files/read_file/shell."""
    if len(historique) < 4:
        return ""
    recent = historique[-6:]
    actions = [a.get("action") for a, _ in recent]

    # Boucle list_files / read_file répétés
    if actions.count("list_files") >= 4 or actions.count("read_file") >= 4:
        fichiers = []
        for nom in tools.list_tree().splitlines()[:20]:
            if nom.strip() and not nom.endswith("/"):
                fichiers.append(nom.strip())
        if fichiers:
            return (
                "\n\n⚠️ TU TOURNES EN ROND. Arrête list_files/read_file. "
                "Choisis immédiatement une action concrète : améliorer un fichier existant avec write_file, "
                "ajouter un nouveau fichier, ou shell/npm. Fichiers disponibles : " + ", ".join(fichiers)
            )

    # Boucle shell répétée avec erreur
    if actions.count("shell") >= 3:
        derniers_resultats = [str(r) for _, r in historique[-3:]]
        if any(r.startswith("ERREUR") for r in derniers_resultats):
            return (
                "\n\n⚠️ TU AS FAIT TROP DE shell QUI ÉCHOUENT. "
                "Arrête shell. Si l'objectif est atteint, appelle done. Sinon fais write_file/read_file."
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
    guidance_kimi: str,
    description_continu: str,
    kimi_only: bool = False,
):
    for tour_in_cycle in range(1, CYCLE_SIZE + 1):
        tour_abs = start_tour + tour_in_cycle - 1
        if tour_abs > max_tours:
            break

        if STOP_FLAG["stop"]:
            _callback_safety(callback, tour_abs, {"action": "done", "args": {}}, "🛑 Arrêt demandé.")
            return True, tour_abs, guidance_kimi, True

        contexte = tools.get_context(max_files=30)

        # Kimi supervisor exactement aux tours 10, 20, 30...
        if tour_abs % CYCLE_SIZE == 0 and tour_abs > 0 and not kimi_only:
            gui = brain.kimi_supervise(tour_abs, objectif, historique, contexte)
            if gui:
                guidance_kimi = gui
                _callback_safety(callback, tour_abs, {"action": "kimi", "args": {}}, "🌙 Kimi supervisor appelé. Intègre son guidage maintenant.")

        prompt_sup = ""
        if continu:
            prompt_sup = (
                f"\n\nMODE CONTINU : {description_continu}. "
                "N'appelle jamais done. Continue à enrichir le projet déjà existant."
            )
        if guidance_kimi:
            prompt_sup += f"\n\nGUIDAGE KIMI : {guidance_kimi}"
            guidance_kimi = ""  # consommé immédiatement

        # Détection anti-boucle
        anti_boucle = _detecter_boucle(historique)
        if anti_boucle:
            prompt_sup += anti_boucle

        decision = _essai_decision(objectif, historique, contexte, prompt_sup, kimi_only=kimi_only)

        # Empêcher les actions inutiles sur fichiers verrouillés
        if decision.get("action") == "write_file":
            chemin = decision.get("args", {}).get("path", "")
            if chemin and _est_verrouille(chemin, verrou):
                decision["pensee"] = f"{chemin} déjà validé. Je passe au suivant."
                decision["action"] = "list_files"
                decision["args"] = {}

        # Bloquer un done prématuré
        if decision.get("action") == "done":
            if not _verifier_done_valide(objectif, historique):
                decision["pensee"] = "Travail incomplet détecté. Je continue plutôt que de terminer."
                decision["action"] = "list_files"
                decision["args"] = {}

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

        # Double contrôle après un write_file : DeepSeek puis Gemma
        avis = None
        suite = ""
        if decision.get("action") == "write_file" and not str(resultat).startswith("ERREUR") and not kimi_only:
            chemin = decision.get("args", {}).get("path", "")
            if chemin:
                contenu = tools.read_file(chemin)
                avis = brain.controler(objectif, chemin, contenu)
                # Gemma relit aussi, mais seulement si elle est fonctionnelle
                gemma_avis = brain.relire_gemma(objectif, chemin, contenu)
                avis["gemma_ok"] = gemma_avis.get("ok", True)
                avis["gemma_raison"] = gemma_avis.get("raison", "")
                _verrouiller(chemin, verrou)
                suite = avis.get("suite", "done")
                if suite.lower() == chemin.lower():
                    suite = ""

                # Si Gemma trouve un bug, on force immédiatement une correction au prochain tour
                if avis.get("gemma_ok") is False:
                    guidance_kimi = (
                        f"Le fichier {chemin} a été validé par DeepSeek mais Gemma voit un défaut : "
                        f"{avis.get('gemma_raison')}. Corrige immédiatement ce fichier en utilisant write_file."
                    )

        narration = _narrer(tour_abs, start_cycle, decision.get("action", "?"), resultat, avis)

        historique.append((decision, resultat))
        _log({"tour": tour_abs, "cycle": start_cycle, "action": decision.get("action"), "args": decision.get("args"),
              "resultat": (str(resultat)[:300] + "..." if len(str(resultat)) > 300 else str(resultat)),
              "pensee": narration})
        _callback_safety(callback, tour_abs, decision, narration)

        if decision.get("action") == "done":
            return True, tour_abs, guidance_kimi, False

    return False, tour_abs, guidance_kimi, False


def boucle(
    objectif: str,
    max_tours: int = 20,
    commit_chaque: int = 5,
    callback: Callable = None,
    continu: bool = False,
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
    guidance_kimi = ""
    termine = False
    cycle = 1
    nb_commits = 0
    kimi_only = False
    ollama_failures = 0

    # Reset stop flag au démarrage
    STOP_FLAG["stop"] = False

    while tour_courant <= max_tours and not termine:
        if STOP_FLAG["stop"]:
            termine = True
            break

        # Si Ollama a planté plusieurs fois, passer entièrement sur Kimi
        if not kimi_only and ollama_failures >= 2:
            print("[loop] bascule définitive sur Kimi pour le reste de la mission")
            kimi_only = True

        termine, dernier_tour, guidance_kimi, stopped = _run_cycle(
            objectif,
            historique,
            verrou,
            tour_courant,
            cycle,
            callback,
            max_tours,
            continu,
            guidance_kimi,
            description_continu,
            kimi_only=kimi_only,
        )
        if stopped:
            termine = True
            if callback:
                _callback_safety(callback, dernier_tour, {"action": "done", "args": {}}, "🛑 Mission arrêtée par l'utilisateur.")
            break

        # Détection d'échec Ollama récurrent
        recent = historique[-10:]
        ollama_failures = sum(
            1 for a, _ in recent
            if "[Kimi fallback]" in str(a.get("pensee", "")) or "[Kimi only]" in str(a.get("pensee", ""))
        )

        if not termine:
            cycle += 1
            tour_courant = dernier_tour + 1

        # Commit auto tous les N tours
        if tour_courant % commit_chaque == 0 and termine is False:
            try:
                msg = f"agent: tour {tour_courant}"
                res = tools.commit_push(msg)
                _callback_safety(callback, tour_courant, {"action": "commit_push", "args": {"message": msg}}, f"💾 {res[:100]}")
                nb_commits += 1
            except Exception as e:
                print(f"[commit auto] {e}")

    # Relecture finale optionnelle
    fixes = _relire_finale(objectif)
    if fixes:
        _log({"tour": 0, "cycle": cycle, "action": "final_review", "pensee": f"Relecture finale : {fixes} fichier(s) corrigé(s)."})

    # Avis final Kimi
    fichiers = []
    for nom in tools.list_tree().splitlines():
        if any(nom.endswith(ext) for ext in (".html", ".js", ".css", ".tsx", ".ts", ".py")):
            fichiers.append(nom)

    guidance_kimi = ""
    if fichiers:
        resume_bloc = []
        for f in fichiers[:8]:
            cont = tools.read_file(f)
            resume_bloc.append(f"=== {f} ===\n{cont[:2000]}")
        bloc = "\n\n".join(resume_bloc)
        guidance_kimi = brain.kimi_final_review(objectif, bloc) or ""

    if callback:
        _callback_safety(callback, 0, {"action": "done", "args": {}}, f"Résumé final : {guidance_kimi or 'Terminé.'}")


def _log(data: dict):
    try:
        print(json.dumps(data, ensure_ascii=False))
    except Exception:
        print(data)
