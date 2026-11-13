"""Daemon TrappistCode : tourne en continu et vide tasks.txt.

Usage :
    python -m agent.daemon

Ajoute un objectif :
    Add-Content tasks.txt "Crée une appli de map spatiale"

Arrêt propre :
    New-Item -ItemType File .agent/STOP
"""
import os, time, traceback
from . import tools, loop

TASKS_FILE = os.path.join(tools.ROOT, "tasks.txt")
DONE_FILE = os.path.join(tools.ROOT, ".agent", "tasks_done.txt")
STOP_FILE = os.path.join(tools.ROOT, ".agent", "STOP")
PAUSE = 5


def prochaine_tache() -> str:
    if not os.path.exists(TASKS_FILE):
        return ""
    with open(TASKS_FILE, encoding="utf-8") as f:
        lignes = [l.strip() for l in f if l.strip()]
    if not lignes:
        return ""
    tache, reste = lignes[0], lignes[1:]
    with open(TASKS_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(reste) + ("\n" if reste else ""))
    os.makedirs(os.path.dirname(DONE_FILE), exist_ok=True)
    with open(DONE_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{time.strftime('%Y-%m-%d %H:%M')}] {tache}\n")
    return tache


def run():
    print("Daemon TrappistCode démarré. Objectifs dans tasks.txt")
    os.makedirs(os.path.join(tools.ROOT, ".agent"), exist_ok=True)
    if os.path.exists(STOP_FILE):
        os.remove(STOP_FILE)

    while not os.path.exists(STOP_FILE):
        tache = prochaine_tache()
        if not tache:
            time.sleep(PAUSE)
            continue

        print(f"\n=== Nouvel objectif : {tache} ===")
        try:
            resume = loop.boucle(
                tache,
                max_tours=0,
                commit_chaque=5,
                callback=lambda t, a, r: print(f"[tour {t}] {a.get('action')}: {str(r)[:200]}"),
            )
            print(f"=== Terminé : {str(resume)[:300]} ===")
            try:
                tools.commit_push(f"agent: objectif terminé - {tache[:60]}")
            except Exception as e:
                print(f"[git] commit ignoré : {e}")
        except Exception:
            traceback.print_exc()
        time.sleep(2)

    print("Daemon arrêté proprement.")


if __name__ == "__main__":
    run()