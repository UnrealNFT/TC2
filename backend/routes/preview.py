"""Route /api/preview : sert les fichiers du workspace (port de server/routes/preview.js)."""
from __future__ import annotations

import mimetypes
import re

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, PlainTextResponse, Response

from backend.lib.workspace import WorkspaceError, get_params, require_base, safe_join

router = APIRouter(prefix="/api/preview", tags=["preview"])

MIME = {
    ".html": "text/html", ".htm": "text/html",
    ".js": "text/javascript", ".mjs": "text/javascript",
    ".jsx": "text/javascript", ".tsx": "text/javascript",
    ".ts": "application/typescript", ".css": "text/css",
    ".json": "application/json", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".ico": "image/x-icon",
    ".md": "text/markdown", ".txt": "text/plain", ".py": "text/x-python",
}

_ATTR_RE = re.compile(r"(href|src)=([\"'])([^\"']+)\2")


def normalize_html_paths(html: str, base_href: str) -> str:
    base = base_href if base_href.endswith("/") else base_href + "/"

    def repl(m: re.Match) -> str:
        attr, quote, val = m.group(1), m.group(2), m.group(3)
        if val.startswith(("http", "//", "data:", "#")):
            return m.group(0)
        if val.startswith("/"):
            return f"{attr}={quote}{base}{val[1:]}{quote}"
        return m.group(0)

    return _ATTR_RE.sub(repl, html)


def get_mime(suffix: str) -> str:
    return MIME.get(suffix) or mimetypes.guess_type("x" + suffix)[0] or "application/octet-stream"


@router.get("/{target:path}")
async def preview(target: str, request: Request):
    p = await get_params(request)
    base = require_base(p)
    try:
        file_path = safe_join(base, target or "index.html")
    except WorkspaceError:
        return PlainTextResponse("Forbidden", status_code=403)
    if file_path.is_dir():
        file_path = file_path / "index.html"
    if not file_path.is_file():
        return PlainTextResponse("Not found", status_code=404)

    suffix = file_path.suffix.lower()
    if suffix in (".html", ".htm"):
        html = file_path.read_text(encoding="utf-8", errors="replace")
        return HTMLResponse(normalize_html_paths(html, "/api/preview/"))
    return Response(content=file_path.read_bytes(), media_type=get_mime(suffix))
