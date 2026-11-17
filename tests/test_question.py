"""Test de agent/question.py sans charger brain/ollama.

Lancer : python tests/test_question.py
"""
import os
import sys

ICI = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ICI, "..", "agent", "question.py")

with open(SRC, encoding="utf-8") as f:
    code = f.read().replace("from . import brain", "brain = None")
ns = {}
exec(code, ns)
est_question = ns["est_question"]

CAS = [
    ("fais un jeu snake", False),
    ("lis index.html", True),
    ("c est quoi ce projet ?", True),
    ("explique le fichier loop.py", True),
    ("corrige le bug du menu", False),
    ("ajoute un bouton", False),
    ("pourquoi ca plante", True),
    ("cree un site", False),
    ("comment marche le backend", True),
    ("make a todo app", False),
    ("fix the css", False),
    ("quel modele est utilise", True),
    ("refais le header", False),
    ("lis le README\n\nCONTEXTE:\ncree un fichier html", True),
    ("hello", False),
]

echecs = 0
for msg, attendu in CAS:
    obtenu = est_question(msg)
    ok = obtenu == attendu
    echecs += not ok
    print(("OK  " if ok else "FAIL"), repr(msg[:35]), "=>", "QUESTION" if obtenu else "ACTION")

print(f"\n{len(CAS) - echecs}/{len(CAS)} OK")
sys.exit(1 if echecs else 0)
