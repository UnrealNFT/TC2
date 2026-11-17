"""Détection question vs action + réponse sans écriture (mode Agent).

Le front envoie "message\n\nCONTEXTE:\n<fichier ouvert>". Les heuristiques ne
doivent regarder QUE le message de l'utilisateur, jamais le CONTEXTE (sinon
"html"/"css" du fichier ouvert transforment une question en chantier web).

Règle : un mot d'action => action (prioritaire). Sinon question seulement si
un vrai marqueur de question est présent. Par défaut => action (comportement
historique de l'agent).
"""
import re

from . import brain

MOTS_ACTION = (
    "crée", "cree", "créé", "créer", "creer", "construis", "construire",
    "génère", "genere", "générer", "generer", "écris", "ecris", "écrire", "ecrire",
    "modifie", "modifier", "ajoute", "ajouter", "supprime", "supprimer",
    "corrige", "corriger", "répare", "repare", "réparer", "reparer",
    "améliore", "ameliore", "améliorer", "ameliorer", "remplace", "remplacer",
    "renomme", "renommer", "déplace", "deplace", "déplacer", "deplacer", "copie", "copier",
    "refais", "refaire", "refactor", "refactorise", "installe", "installer",
    "commit", "push", "fix", "change", "changer", "mets", "mettre",
    "fais", "faire", "implémente", "implemente", "implémenter", "implementer",
    "développe", "developpe", "développer", "developper", "code", "coder",
    "optimise", "optimiser", "nettoie", "nettoyer", "traduis", "traduire",
    "transforme", "transformer", "convertis", "convertir", "intègre", "integre",
    "rajoute", "rajouter", "enlève", "enleve", "retire", "retirer",
    "make", "create", "build", "add", "write", "update", "delete", "remove",
)
MOTS_QUESTION = (
    "lis", "lire", "explique", "expliquer", "pourquoi", "comment", "quoi",
    "résume", "resume", "résumer", "resumer", "décris", "decris", "analyse",
    "analyser", "montre", "montrer", "quel", "quelle", "quels", "quelles",
    "combien", "où", "est-ce", "what", "why", "how", "explain",
)
EXPRESSIONS_QUESTION = (
    "c'est quoi", "c est quoi", "cest quoi", "que fait", "qu'est-ce", "qu est ce",
    "dis-moi", "dis moi", "ton avis", "à quoi sert", "a quoi sert",
)


def _mot_present(mots, texte: str) -> bool:
    return any(re.search(rf"(?<!\w){re.escape(m)}(?!\w)", texte) for m in mots)


def message_utilisateur(objectif: str) -> str:
    """Retire le bloc CONTEXTE ajouté par le front."""
    return re.split(r"\n\s*CONTEXTE\s*:", objectif or "", maxsplit=1)[0].strip()


def est_question(objectif: str) -> bool:
    """Vrai si l'utilisateur veut une réponse, pas des modifications."""
    q = message_utilisateur(objectif).lower()
    if not q:
        return False
    if _mot_present(MOTS_ACTION, q):
        return False
    if "?" in q or any(e in q for e in EXPRESSIONS_QUESTION):
        return True
    return _mot_present(MOTS_QUESTION, q)


def repondre_sur_projet(objectif: str, contexte: str, model_key: str = "gemma") -> dict:
    """Répond à la question à partir des fichiers du projet. Aucune écriture."""
    question = message_utilisateur(objectif)
    extra = objectif[len(question):].strip()
    ctx = f"{extra}\n\nFICHIERS DU PROJET :\n{contexte}".strip()
    texte = brain.repondre_conversation([], question, ctx[:6000], model_key=model_key)
    return {"pensee": "Question : je réponds sans modifier de fichier.", "action": "done", "args": {"resume": texte}}
