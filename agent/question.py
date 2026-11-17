"""Détection question vs action + réponse sans écriture (mode Agent).

Le front envoie "message\n\nCONTEXTE:\n<fichier ouvert>". Les heuristiques ne
doivent regarder QUE le message de l'utilisateur, jamais le CONTEXTE (sinon
"html"/"css" du fichier ouvert transforment une question en chantier web).
"""
import re

from . import brain

MOTS_ACTION = (
    "crée", "cree", "créé", "créer", "creer", "construis", "génère", "genere",
    "écris", "ecris", "modifie", "ajoute", "supprime", "corrige", "répare", "repare",
    "améliore", "ameliore", "remplace", "renomme", "déplace", "deplace", "copie",
    "refais", "refactor", "installe", "commit", "push", "fix", "change", "mets",
)
MOTS_QUESTION = (
    "lis", "lire", "explique", "c'est quoi", "c est quoi", "cest quoi", "quoi",
    "pourquoi", "comment", "que fait", "qu'est-ce", "qu est ce", "résume", "resume",
    "décris", "decris", "analyse", "montre", "dis-moi", "dis moi", "ton avis", "?",
)


def message_utilisateur(objectif: str) -> str:
    """Retire le bloc CONTEXTE ajouté par le front."""
    return re.split(r"\n\s*CONTEXTE\s*:", objectif or "", maxsplit=1)[0].strip()


def est_question(objectif: str) -> bool:
    """Vrai si l'utilisateur veut une réponse, pas des modifications."""
    q = message_utilisateur(objectif).lower()
    if not q:
        return False
    if any(re.search(rf"\b{re.escape(m)}", q) for m in MOTS_ACTION):
        return False
    return any(m in q for m in MOTS_QUESTION) or len(q) < 20


def repondre_sur_projet(objectif: str, contexte: str, model_key: str = "gemma") -> dict:
    """Répond à la question à partir des fichiers du projet. Aucune écriture."""
    question = message_utilisateur(objectif)
    extra = objectif[len(question):].strip()
    ctx = f"{extra}\n\nFICHIERS DU PROJET :\n{contexte}".strip()
    texte = brain.repondre_conversation([], question, ctx[:6000], model_key=model_key)
    return {"pensee": "Question : je réponds sans modifier de fichier.", "action": "done", "args": {"resume": texte}}
