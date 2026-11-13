"""Boucle autonome : amélioration continue permanente."""
import json, os, time
from . import brain, tools

LOG_DIR = os.path.join(tools.ROOT, ".agent")
STOP_FILE = os.path.join(LOG_DIR, "STOP")


def _log(entry: dict):
    os.makedirs(LOG_DIR, exist_ok=True)
    with open(os.path.join(LOG_DIR, "journal.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def executer(action: dict) -> str:
    nom = action.get("action", "")
    args = action.get("args", {}) or {}
    if nom == "commit_push":
        return tools.commit_push(action.get("message_commit") or args.get("message", "agent: avancement"))
    fn = tools.TOOLS.get(nom)
    if not fn:
        return f"Action inconnue: {nom}"
    try:
        return str(fn(**args))
    except TypeError as e:
        return f"Args invalides pour {nom}: {e}"
    except Exception as e:
        return f"Erreur {nom}: {e}"


def boucle(objectif: str, max_tours: int = 0, commit_chaque: int = 5, callback=None):
    historique = []
    tours_sans_commit = 0
    tour = 0
    erreurs_json = 0
    objectif_actuel = objectif

    while not os.path.exists(STOP_FILE):
        tour += 1
        if max_tours > 0 and tour > max_tours:
            return f"Max tours atteint ({max_tours})."

        contexte = tools.list_files()
        action = brain.decider(objectif_actuel, historique, contexte)
        nom = action.get("action", "?")
        pensee = action.get("pensee", "")

        # Gestion des erreurs JSON
        if nom == "done" and any(x in pensee for x in ["JSON invalide", "Pas de JSON"]):
            erreurs_json += 1
            if erreurs_json < 4:
                if callback:
                    callback(tour, action, "Format invalide, nouvel essai...")
                time.sleep(1)
                continue
            erreurs_json = 0

        erreurs_json = 0

        # Au lieu de s'arrêter sur "done", on passe en mode amélioration continue
        if nom == "done":
            resume = action.get("args", {}).get("resume", "amélioration")
            _log({"tour": tour, "amelioration": resume})
            if callback:
                callback(tour, action, f"Amélioration continue : {resume}")

            # On se donne un nouvel objectif d'amélioration
            objectif_actuel = (
                f"Continue d'améliorer le projet. "
                f"Dernière action : {resume}. "
                f"Ajoute des détails, optimise, améliore le design ou les fonctionnalités."
            )
            historique.append(("amélioration continue", resume[:200]))
            time.sleep(2)
            continue

        # Action normale
        resultat = executer(action)
        critique = brain.verifier(objectif_actuel, action, resultat)
        historique.append((f"{nom}", resultat[:350] + " | " + critique[:150]))
        _log({"tour": tour, "action": action, "resultat": resultat[:1500]})

        if callback:
            callback(tour, action, resultat)

        tours_sans_commit += 1
        if nom in ("write_file", "trappist_generate") and tours_sans_commit >= commit_chaque:
            tools.commit_push(f"agent: amélioration continue (tour {tour})")
            tours_sans_commit = 0

        time.sleep(1)

    return "Arrêté manuellement (fichier STOP détecté)."


if __name__ == "__main__":
    import sys
    obj = sys.argv[1] if len(sys.argv) > 1 else input("Objectif : ")

    def console(t, a, r):
        print(f"\n--- Tour {t} : {a.get('action')} ---")
        print(str(r)[:500])

    print(boucle(obj, callback=console))