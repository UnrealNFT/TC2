"""Boucle principale de l'agent TrappistCode.

Chaque tour = une action (outil).
Un cycle = 10 tours. Kimi fait une revue à la fin de chaque cycle.
"""
import json, os, re, time
from . import brain, tools

CYCLE_LENGTH = 10


def _log(entry: dict):
    log_dir = os.path.join(tools.ROOT, ".agent")
    try:
        os.makedirs(log_dir, exist_ok=True)
        with open(os.path.join(log_dir, "loop.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _normaliser_index_html(html: str, root: str) -> str:
    """Convertit les href/src absolus pointant vers root en chemins relatifs."""
    if not html or not root:
        return html
    root_lower = root.lower()

    def replace_attr(m: re.Match) -> str:
        attr = m.group(1)
        val = m.group(2)
        if val.startswith(("http", "//", "#", "data:")):
            return m.group(0)
        abs_val = os.path.abspath(val)
        if abs_val.lower().startswith(root_lower):
            rel = os.path.relpath(abs_val, root).replace("\\", "/")
            return f'{attr}="{rel}"'
        return m.group(0)

    html = re.sub(r'(href|src)="([^"]+)"', replace_attr, html)
    return re.sub(r"(href|src)='([^']+)'", replace_attr, html)


def _narrer(action: dict, resultat: str) -> str:
    """Raconte l'action en langage humain pour les logs/chat."""
    nom = action.get("action", "?")
    args = action.get("args") or {}
    path = args.get("path", "")
    chemin = path if path else ""

    if nom == "write_file":
        return f"✍️ J'écris le fichier {chemin} ({len(args.get('content', ''))} car.)."
    if nom == "append_file":
        return f"➕ J'ajoute du contenu à {chemin}."
    if nom == "read_file":
        return f"👁️ Je lis {chemin} pour comprendre le contexte."
    if nom == "list_files":
        return "📁 Je liste les fichiers du projet."
    if nom == "list_tree":
        return "🌳 Je regarde l'arborescence du projet."
    if nom == "get_context":
        return "🧠 Je récupère le contexte global du projet."
    if nom == "shell":
        return f"⚡ J'exécute la commande : {args.get('cmd', '')[:60]}..."
    if nom == "git":
        return f"🔀 Git : {args.get('args', '')[:60]}"
    if nom == "commit_push":
        return f"🚀 Commit et push : {args.get('message', '')[:80]}"
    if nom == "delete_file":
        return f"🗑️ Je supprime {chemin}."
    if nom == "copy_file":
        return f"📄 Je copie {args.get('src', '')} vers {args.get('dst', '')}."
    if nom == "move_file":
        return f"🚚 Je déplace {args.get('src', '')} vers {args.get('dst', '')}."
    if nom == "rename_file":
        return f"🏷️ Je renomme {args.get('src', '')} en {args.get('dst', '')}."
    if nom == "trappist_generate":
        return f"🎨 Je génère un asset {args.get('kind', '')} dans {chemin}."
    if nom == "set_root":
        return f"📂 Je change de dossier de travail : {args.get('path', '')}."
    if nom == "exists_file":
        return f"❓ Je vérifie si {chemin} existe."
    return f"🔧 Action {nom} -> {str(resultat)[:120]}"


def _chemin(action: dict) -> str:
    args = action.get("args") or {}
    return args.get("path", "") or args.get("out_path", "") or args.get("dst", "") or args.get("src", "") or "fichier"


def _cycle(tour: int) -> int:
    return (tour - 1) // CYCLE_LENGTH + 1


def boucle(objectif: str, max_tours: int = 20, commit_chaque: int = 5,
           callback=None, continu: bool = False):
    suite = ""
    historique = []
    done_refuses = 0
    verrou = set()
    essais = {}

    for tour in range(1, max_tours + 1):
        cycle = _cycle(tour)
        contexte = tools.get_context(max_files=12)
        etat = "Continuer" if continu else "Planifier"
        plan = brain.planifier(objectif, contexte, historique, suite, etat)
        action = plan.get("action", "done")
        args = plan.get("args", {})

        if action in ("done", "terminé", "termine", "rien"):
            if callback:
                callback(tour, {"action": "done", "args": {}}, "objectif atteint")
            _log({"tour": tour, "cycle": cycle, "action": "done", "pensee": "objectif atteint"})
            break

        try:
            fn = tools.TOOLS.get(action)
            if not fn:
                raise ValueError(f"outil inconnu: {action}")
            resultat = fn(**args)
        except Exception as e:
            resultat = f"ERREUR: {e}"

        narration = _narrer({"action": action, "args": args}, resultat)
        historique.append({"tour": tour, "action": action, "args": args, "resultat": str(resultat)[:300]})

        if callback:
            callback(tour, {"action": action, "args": args}, resultat)
        _log({"tour": tour, "cycle": cycle, "action": action, "args": args,
              "resultat": str(resultat)[:300], "pensee": narration})

        # Étape DeepSeek de contrôle après chaque write_file
        if action == "write_file" and str(resultat).startswith("OK"):
            chemin = _chemin({"action": action, "args": args})
            try:
                contenu = tools.read_file(chemin)
            except Exception:
                contenu = args.get("content", "")

            # Normalise index.html : liens absolus -> relatifs
            if chemin.lower().endswith("index.html"):
                try:
                    contenu_normalise = _normaliser_index_html(contenu, tools.ROOT_INITIAL or tools.ROOT)
                    if contenu_normalise != contenu:
                        tools.write_file(chemin, contenu_normalise)
                        contenu = contenu_normalise
                except Exception as e:
                    print(f"[normalisation index.html] {e}")

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
            _log({"tour": tour, "cycle": cycle, "action": "deepseek", "pensee": critique, "chemin": chemin})
            done_refuses = 0

        # Commit automatique tous les N tours
        if tour % commit_chaque == 0:
            try:
                tools.git('add -A')
                tools.git(f'commit -m "auto tour {tour}"')
                msg = f"💾 Commit automatique tour {tour}."
                if callback:
                    callback(tour, {"action": "commit", "args": {}}, msg)
                _log({"tour": tour, "cycle": cycle, "action": "commit", "pensee": msg})
            except Exception:
                pass

        # Revue Kimi tous les 10 tours
        if tour % CYCLE_LENGTH == 0:
            try:
                from .kimi import review_cycle
                resume = review_cycle(historique[-10:], objectif)
                if callback:
                    callback(tour, {"action": "kimi", "args": {}}, resume)
                _log({"tour": tour, "cycle": cycle, "action": "kimi", "pensee": resume})
            except Exception as e:
                print(f"[kimi cycle] {e}")

        # Anti-done frauduleux
        if str(resultat).lower().startswith(("déjà", "deja", "rien", "pas besoin", "terminé", "termine", "done")):
            done_refuses += 1
            if done_refuses >= 3:
                if callback:
                    callback(tour, {"action": "done", "args": {}}, "terminé par sécurité")
                _log({"tour": tour, "cycle": cycle, "action": "done", "pensee": "terminé par sécurité"})
                break

        time.sleep(0.2)

    # Revue finale
    try:
        final_tree = tools.list_tree()
        rapport = brain.relecture_finale(objectif, final_tree)
        if callback:
            callback(0, {"action": "final", "args": {}}, rapport)
        _log({"tour": 0, "cycle": _cycle(max_tours), "action": "final", "pensee": rapport})
    except Exception as e:
        print(f"[relecture finale] {e}")
