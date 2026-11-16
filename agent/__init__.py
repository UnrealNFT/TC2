"""Agent autonome TrappistCode : cerveau LLM local + outils projet + daemon continu."""

# Branche le trio (plan Kimi, juge avant done, budget, revue finale).
# Pour revenir à l'ancien comportement : commenter le bloc ci-dessous.
try:
    from . import branche  # noqa: F401
except Exception as _e:  # le bot doit démarrer même si le branchement casse
    print(f"[agent] trio non branché : {_e}")
