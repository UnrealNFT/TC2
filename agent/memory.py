"""Mémoire persistante des retours Kimi pour enrichir Gemma.

Stockage local SQLite simple : un feedback par ligne avec mission, tour,
fichier concerné, erreur rencontrée et conseil de Kimi.
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "agent_memory.db"


def _connect():
    return sqlite3.connect(DB_PATH)


def init():
    """Crée la table si elle n'existe pas."""
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS kimi_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mission TEXT,
                tour INTEGER,
                fichier TEXT,
                erreur TEXT,
                conseil_kimi TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()


def save_kimi_feedback(
    mission: str, tour: int, fichier: str, erreur: str, conseil: str
):
    """Sauvegarde un retour Kimi pour une mission donnée."""
    init()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO kimi_feedback (mission, tour, fichier, erreur, conseil_kimi)
            VALUES (?, ?, ?, ?, ?)
            """,
            (mission, tour, fichier, erreur, conseil),
        )
        conn.commit()


def get_latest_kimi_feedback(
    mission: str, fichier: str | None = None, limit: int = 3
) -> list[tuple]:
    """Récupère les derniers conseils Kimi pour une mission/fichier."""
    init()
    with _connect() as conn:
        query = (
            "SELECT tour, fichier, erreur, conseil_kimi "
            "FROM kimi_feedback WHERE mission = ?"
        )
        params = [mission]
        if fichier:
            query += " AND fichier = ?"
            params.append(fichier)
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(query, params).fetchall()
    # remettre dans l'ordre chronologique (le plus ancien d'abord)
    return rows[::-1]


def get_all_kimi_feedback(mission: str) -> list[tuple]:
    """Récupère tous les retours Kimi d'une mission."""
    init()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT tour, fichier, erreur, conseil_kimi "
            "FROM kimi_feedback WHERE mission = ? ORDER BY timestamp ASC",
            (mission,),
        ).fetchall()
    return rows
