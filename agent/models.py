"""Catalogue des modèles disponibles dans TrappistCode.

Chaque modèle travaille en SOLO : il planifie, écrit et se relit lui-même.
Aucun relais automatique vers un autre modèle (comportement type Copilot).

- type "ollama"    : modèle local via Ollama
- type "wavespeed" : modèle en ligne via l'API WaveSpeed
"""

MODELES = {
    "gemma": {
        "label": "Gemma 4 12B (local)",
        "type": "ollama",
        "id": "satgeze/gemma4-12b-uncensored-1m:latest",
        "description": "Modèle local principal. Code au quotidien, hors-ligne.",
    },
    "deepseek": {
        "label": "DeepSeek-Qwen 9B (local)",
        "type": "ollama",
        "id": "hf.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-i1-GGUF:Q4_K_M",
        "description": "Modèle local économique, plus léger.",
    },
    "kimi": {
        "label": "Kimi K2.7 (en ligne)",
        "type": "wavespeed",
        "id": "moonshotai/kimi-k2.7-code",
        "description": "Puissant. Tâches complexes, gros refactorings.",
    },
    "glm": {
        "label": "GLM 5.3 Flash (en ligne)",
        "type": "wavespeed",
        "id": "z-ai/glm-5.3-flash",
        "description": "Rapide et économique en ligne.",
    },
}

# Modèle utilisé si le frontend n'en précise pas un.
MODELE_DEFAUT = "gemma"


def catalogue() -> list:
    """Liste des modèles pour le frontend (GET /models)."""
    return [
        {"key": cle, "label": m["label"], "type": m["type"], "description": m["description"]}
        for cle, m in MODELES.items()
    ]


def get(key: str) -> dict:
    """Renvoie la config d'un modèle, ou le défaut si la clé est inconnue."""
    return MODELES.get(key, MODELES[MODELE_DEFAUT])
