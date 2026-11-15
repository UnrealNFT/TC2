"""Gestion du workspace : décodage du chemin de base + protection path traversal.

Port Python de server/lib/workspace.js.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from fastapi import Request


class WorkspaceError(Exception):
    """Erreur liée au workspace (base manquante, path traversal...)."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


async def get_params(request: Request) -> dict[str, Any]:
    """Fusionne query string + body JSON (équivalent req.query / req.body)."""
    data: dict[str, Any] = dict(request.query_params)
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        try:
            body = await request.json()
            if isinstance(body, dict):
                data.update(body)
        except Exception:
            pass
    return data


def decode_base(raw: Any) -> Path | None:
    if not raw:
        return None
    s = unquote(str(raw)).strip()
    if not s:
        return None
    p = Path(s)
    if not p.is_absolute():
        return None
    return p.resolve()


def require_base(params: dict[str, Any]) -> Path:
    base = decode_base(params.get("base")) or decode_base(os.getenv("TRAPPIST_WORKSPACE"))
    if not base:
        raise WorkspaceError("workspace base required", 400)
    return base


def is_inside(base: Path, target: Path) -> bool:
    base = base.resolve()
    target = target.resolve()
    return target == base or base in target.parents


def safe_join(base: Path, rel: Any) -> Path:
    rel_str = str(rel or "").replace("\\", "/").lstrip("/")
    resolved = (base / rel_str).resolve()
    if not is_inside(base, resolved):
        raise WorkspaceError("Path traversal detected", 403)
    return resolved
