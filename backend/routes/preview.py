"""Route /api/preview : sert les fichiers du workspace.

Le workspace est encode dans le chemin (/api/preview/w/<b64url>/...) pour que
les liens relatifs (style.css, js/app.js) d'une page HTML se resolvent
correctement : un ?base= dans la query est perdu par le navigateur.
"""
from __future__ import annotations

import base64
import mimetypes
import re
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse, RedirectResponse, Response

from backend.lib.workspace import WorkspaceError, decode_base, get_params, require_base, safe_join

router = APIRouter(prefix="/api/preview", tags=["preview"])
PREFIX = "/api/preview/w"

MIME = {
    ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".jsx": "text/javascript; charset=utf-8", ".ts": "text/javascript; charset=utf-8",
    ".tsx": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
    ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
    ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".wasm": "application/wasm",
    ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
}
NO_CACHE = {"Cache-Control": "no-store"}

# Liens absolus "/xxx" (mais pas "//cdn") -> racine du workspace
_ABS_RE = re.compile(r"\b(href|src)=([\"'])/(?!/)([^\"']*)\2", re.IGNORECASE)


def b64e(s: str) -> str:
    return base64.urlsafe_b64encode(s.encode("utf-8")).decode().rstrip("=")


def b64d(s: str) -> str | None:
    try:
        return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4)).decode("utf-8")
    except Exception:
        return None


def normalize_html_paths(html: str, prefix: str) -> str:
    return _ABS_RE.sub(lambda m: f"{m.group(1)}={m.group(2)}{prefix}/{m.group(3)}{m.group(2)}", html)


def get_mime(suffix: str) -> str:
    return MIME.get(suffix) or mimetypes.guess_type("x" + suffix)[0] or "application/octet-stream"


def serve(base, rel: str, prefix: str):
    try:
        file_path = safe_join(base, rel or "index.html")
    except WorkspaceError:
        return PlainTextResponse("Forbidden", status_code=403)
    if file_path.is_dir():
        file_path = file_path / "index.html"
    if not file_path.is_file():
        return PlainTextResponse("Not found", status_code=404)

    suffix = file_path.suffix.lower()
    if suffix in (".html", ".htm"):
        html = file_path.read_text(encoding="utf-8", errors="replace")
        return Response(normalize_html_paths(html, prefix), media_type=MIME[".html"], headers=NO_CACHE)
    return Response(content=file_path.read_bytes(), media_type=get_mime(suffix), headers=NO_CACHE)


@router.get("/w/{token}/{target:path}")
async def preview_ws(token: str, target: str):
    base = decode_base(b64d(token))
    if not base:
        return PlainTextResponse("workspace invalide", status_code=400)
    return serve(base, target, f"{PREFIX}/{token}")


@router.get("/{target:path}")
async def preview_legacy(target: str, request: Request):
    """Ancien format ?base=... -> redirige vers /w/<b64>/... pour que les liens relatifs marchent."""
    base = require_base(await get_params(request))
    return RedirectResponse(f"{PREFIX}/{b64e(str(base))}/{quote(target)}", status_code=302)
