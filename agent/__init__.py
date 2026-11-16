"""Agent autonome TrappistCode : cerveau LLM + outils projet + daemon continu.

Mode SOLO par défaut : un seul modèle travaille à la fois, sans relais.
Le trio (plan Kimi + juge) n'est PAS branché automatiquement.
Pour le réactiver temporairement : from agent import branche
"""

# Le trio n'est plus branché par défaut. Le mode solo est le comportement standard.
# try:
#     from . import branche  # noqa: F401
# except Exception as _e:
#     print(f"[agent] trio non branché : {_e}")
