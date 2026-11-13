"""Boucle autonome : une tâche, puis stop. continu=True améliore sans s'arrêter.

Après chaque write_file réussi, DeepSeek lit le fichier.
- ok : le chemin entre dans verrou. On refuse de le réécrire.
- pas ok : une seule correction, puis on verrouille quand même.

Kimi (WaveSpeed) n'est appelé que si Gemma est bloquée :
- elle n'a pas renvoyé d'ordre lisible
- elle dit terminé alors qu'un fichier demandé n'existe pas
Deux appels maximum par objectif.
"""
import json, os, time
from . import brain, tools


def _dirs():
    log_dir = os.path.join(tools.ROOT, ".agent")
    return log_dir, os.path.join(log_dir, "STOP")


def _log(entry: dict):
    log_dir, _ = _dirs()
    os.makedirs(log_dir, exist_ok=True)
    with open(os.path.join(log_dir, "journal.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def _chemin(action: dict) -> str:
    brut = str((action.get("args") or {}).get("path", ""))
    return brut.replace("\\", "/").lstrip("./").lower()


def _fichier_manquant(objectif: str, contexte: str, suite: str, verrou: set) -> str:
    """Le nom du prochain fichier, ou une chaîne vide si on peut vraiment s'arrêter."""
    if suite and suite not in verrou and suite not in ("done", "terminé", "termine"):
        mot = suite.replace("\\", "/").split()[0].strip(".,;:")
        if "." in mot and mot not in verrou:
            return mot
    fichiers = (contexte or "").lower()
    obj = (objectif or "").lower()
    for nom in ("index.html", "admin.html", "style.css", "script.js"):
        if nom in obj and nom not in fichiers and nom not in verrou:
            return nom
    return ""


def _kimi(tour, objectif, historique, contexte, raison, callback, appels_kimi):
    """Un appel WaveSpeed. Renvoie (action, appels_kimi)."""
    appels_kimi += 1
    if callback:
        callback(tour, {"action": "kimi", "args": {}}, raison)
    action = brain.secours_kimi(objectif, historique, contexte, raison)
    return action, appels_kimi


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


def boucle(objectif: str, max_tours: int = 0, commit_chaque: int = 5, callback=None, continu: bool = False):
    historique = []
    tours_sans_commit = 0
    tour = 0
    erreurs_json = 0
    essais = {}
    verrou = set()
    refus = 0
    appels_kimi = 0
    suite = ""
    done_refuses = 0

    while True:
        _, stop_file = _dirs()
        if os.path.exists(stop_file):
            return "Arrêté manuellement (fichier STOP détecté)."

        tour += 1
        if max_tours > 0 and tour > max_tours:
            return f"Max tours atteint ({max_tours})."

        contexte = tools.list_files()
        try:
            action = brain.decider(objectif, historique, contexte)
        except Exception as e:
            action = {"pensee": "Pas de JSON", "action": "?", "args": {}, "erreur": str(e)[:200]}

        nom = action.get("action", "?")
        pensee = action.get("pensee", "")

        if (pensee == "Pas de JSON" or nom in ("?", "")) and appels_kimi < 2:
            action, appels_kimi = _kimi(
                tour, objectif, historique, contexte,
                pensee or action.get("erreur") or "JSON illisible",
                callback, appels_kimi,
            )
            nom = action.get("action", "?")
            pensee = action.get("pensee", "")

        if pensee == "Pas de JSON" or nom in ("?", ""):
            erreurs_json += 1
            if erreurs_json < 4:
                if callback:
                    callback(tour, action, "Format invalide, nouvel essai...")
                time.sleep(1)
                continue
            return "Abandon : ni Gemma ni Kimi n'ont produit d'ordre lisible."

        erreurs_json = 0

        if nom == "done":
            if any(k in objectif.lower() for k in ("lis", "lire", "que fait", "répond", "repond")) \
                    and not any(h[0] in ("list_files", "read_file") for h in historique):
                historique.append(("done refusé", "pas encore lu"))
                if callback:
                    callback(tour, action, "Pas encore lu. list_files, puis read_file.")
                time.sleep(1)
                continue
            manque = _fichier_manquant(objectif, contexte, suite, verrou)
            if manque and done_refuses < 3:
                done_refuses += 1
                if appels_kimi < 2:
                    action, appels_kimi = _kimi(
                        tour, objectif, historique, contexte,
                        f"Pas fini. Il reste à écrire {manque}. Interdit de répondre done.",
                        callback, appels_kimi,
                    )
                    nom = action.get("action", "?")
                if nom == "done" or nom in ("?", ""):
                    historique.append(("done refusé", f"Il reste {manque}"))
                    if callback:
                        callback(tour, action, f"Pas fini. Fichier suivant : {manque}")
                    time.sleep(1)
                    continue
            elif manque:
                return f"Arrêté : {manque} n'a pas été écrit."
            else:
                resume = action.get("args", {}).get("resume", "terminé")
                _log({"tour": tour, "done": resume})
                if callback:
                    callback(tour, action, resume)
                if not continu:
                    return resume
                objectif = (
                    "Continue d'améliorer cette application pour la rendre plus rapide et plus solide. "
                    f"Dernier état : {resume}. Ne réécris pas un fichier déjà validé. "
                    "Change quelque chose de concret, puis vérifie."
                )
                historique.append(("done", resume[:200]))
                suite = ""
                time.sleep(2)
                continue

        if nom == "write_file":
            chemin = _chemin(action)
            if chemin in verrou:
                refus += 1
                resultat = f"REFUSÉ. {chemin} est validé par DeepSeek. Passe au fichier suivant, ou done."
                historique.append((f"write_file {chemin}", resultat))
                _log({"tour": tour, "action": action, "resultat": resultat})
                if callback:
                    callback(tour, action, resultat)
                if refus >= 4:
                    return "Stop : le modèle réécrivait des fichiers déjà validés."
                time.sleep(1)
                continue

        refus = 0
        resultat = executer(action)
        critique = brain.verifier(objectif, action, resultat)

        if nom == "write_file" and str(resultat).startswith("OK"):
            chemin = _chemin(action)
            try:
                contenu = tools.read_file((action.get("args") or {}).get("path", ""))
            except Exception:
                contenu = (action.get("args") or {}).get("content", "")
            avis = brain.controler(objectif, chemin, contenu)
            critique = f"deepseek ok={avis.get('ok')} — {avis.get('raison')} — suite: {avis.get('suite')}"
            if avis.get("ok") or essais.get(chemin, 0) >= 1:
                verrou.add(chemin)
            else:
                essais[chemin] = 1
            suivant = str(avis.get("suite") or "done").strip().lower().split()[0].strip(".,;:")
            if suivant not in ("", "done", "terminé", "termine", chemin):
                suite = suivant
            elif suite == chemin:
                suite = ""
            if callback:
                callback(tour, {"action": "deepseek", "args": {"path": chemin}}, critique)
            _log({"tour": tour, "deepseek": avis, "chemin": chemin})
            done_refuses = 0

        historique.append((nom, resultat[:350] + " | " + critique[:200]))
        _log({"tour": tour, "action": action, "resultat": resultat[:1500], "critique": critique})

        if callback:
            callback(tour, action, resultat)

        tours_sans_commit += 1
        if nom in ("write_file", "trappist_generate") and tours_sans_commit >= commit_chaque:
            tools.commit_push(f"agent: avancement (tour {tour})")
            tours_sans_commit = 0

        time.sleep(1)


if __name__ == "__main__":
    import sys
    obj = sys.argv[1] if len(sys.argv) > 1 else input("Objectif : ")

    def console(t, a, r):
        print(f"\n--- Tour {t} : {a.get('action')} ---")
        print(str(r)[:500])

    print(boucle(obj, callback=console))