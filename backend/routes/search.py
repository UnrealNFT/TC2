"""Routes /api/search : workspace, web (DuckDuckGo), GitHub (port de server/routes/search.js)."""
from __future__ import annotations

import html as html_lib
import os
import re
from pathlib import Path
from urllib.parse import quote

import requests
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.lib.workspace import get_params, require_base

router = APIRouter(prefix="/api/search", tags=["search"])

SKIP_DIRS = {"node_modules", ".git", "dist", ".agent", "__pycache__", ".venv", "venv"}
MAX_FILE_SIZE = 1024 * 1024
MAX_RESULTS = 30


def walk(base: Path):
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            yield Path(root) / name


@router.post("/workspace")
async def search_workspace(request: Request):
    p = await get_params(request)
    base = require_base(p)
    query = str(p.get("query") or p.get("q") or "").strip()
    if not query:
        return JSONResponse(status_code=400, content={"error": "query required"})

    results: list[str] = []
    for full in walk(base):
        try:
            if full.stat().st_size > MAX_FILE_SIZE:
                continue
            if query in full.read_text(encoding="utf-8", errors="ignore"):
                results.append(full.relative_to(base).as_posix())
                if len(results) >= MAX_RESULTS:
                    break
        except OSError:
            continue
    return {"query": query, "results": results}


_DDG_RE = re.compile(
    r"<a[^>]+result__a[^>]*>([\s\S]*?)</a>.*?<a[^>]+result__snippet[^>]*>([\s\S]*?)</a>",
    re.S,
)
_TAG_RE = re.compile(r"<[^>]+>")


def _clean(s: str) -> str:
    return html_lib.unescape(_TAG_RE.sub("", s)).strip()


@router.get("/web")
async def search_web(q: str | None = None):
    if not q:
        return JSONResponse(status_code=400, content={"error": "q required"})
    r = requests.get(
        f"https://html.duckduckgo.com/html/?q={quote(q)}",
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=15,
    )
    r.raise_for_status()
    snippets = [f"{_clean(t)}: {_clean(s)}" for t, s in _DDG_RE.findall(r.text)[:3]]
    return {"query": q, "snippet": "\n".join(snippets)[:2000] or "Aucun résultat"}


@router.get("/github")
async def search_github(q: str | None = None):
    if not q:
        return JSONResponse(status_code=400, content={"error": "q required"})
    headers = {"Accept": "application/vnd.github+json"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.get(
        f"https://api.github.com/search/repositories?q={quote(q)}&per_page=5",
        headers=headers,
        timeout=15,
    )
    r.raise_for_status()
    repos = [
        {
            "name": it["full_name"],
            "url": it["html_url"],
            "description": it.get("description"),
            "stars": it.get("stargazers_count"),
        }
        for it in r.json().get("items", [])
    ]
    return {"query": q, "repos": repos}
