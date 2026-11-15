"""Routes /api/files : CRUD sur le workspace local (port de server/routes/files.js)."""
from __future__ import annotations

import shutil
from datetime import datetime, timezone
from posixpath import join as posix_join

from fastapi import APIRouter, Request

from backend.lib.workspace import WorkspaceError, get_params, require_base, safe_join

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/list")
async def list_dir(request: Request):
    p = await get_params(request)
    base = require_base(p)
    rel = p.get("path") or ""
    directory = safe_join(base, rel)
    items = [
        {
            "name": e.name,
            "path": posix_join(rel, e.name) if rel else e.name,
            "type": "dir" if e.is_dir() else "file",
        }
        for e in directory.iterdir()
    ]
    items.sort(key=lambda i: (i["type"] != "dir", i["name"].lower()))
    return items


@router.get("/read")
async def read_file(request: Request):
    p = await get_params(request)
    base = require_base(p)
    target = safe_join(base, p.get("path"))
    content = target.read_text(encoding="utf-8", errors="replace")
    return {"path": p.get("path"), "content": content}


@router.post("/write")
async def write_file(request: Request):
    p = await get_params(request)
    base = require_base(p)
    target = safe_join(base, p.get("path"))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(p.get("content") or "", encoding="utf-8")
    return {"ok": True, "path": p.get("path")}


@router.post("/mkdir")
async def mkdir(request: Request):
    p = await get_params(request)
    base = require_base(p)
    safe_join(base, p.get("path")).mkdir(parents=True, exist_ok=True)
    return {"ok": True, "path": p.get("path")}


@router.post("/rename")
async def rename(request: Request):
    p = await get_params(request)
    base = require_base(p)
    old = safe_join(base, p.get("oldPath"))
    new = safe_join(base, p.get("newPath"))
    new.parent.mkdir(parents=True, exist_ok=True)
    old.rename(new)
    return {"ok": True}


@router.post("/delete")
async def delete(request: Request):
    p = await get_params(request)
    base = require_base(p)
    target = safe_join(base, p.get("path"))
    if target == base:
        raise WorkspaceError("Refus de supprimer la racine du workspace", 403)
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    return {"ok": True}


@router.get("/stat")
async def stat(request: Request):
    p = await get_params(request)
    base = require_base(p)
    target = safe_join(base, p.get("path") or "")
    st = target.stat()
    return {
        "path": p.get("path"),
        "isDirectory": target.is_dir(),
        "size": st.st_size,
        "mtime": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
    }
