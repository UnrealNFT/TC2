"""Routes /api/zip : export / import du workspace (port de server/routes/zip.js)."""
from __future__ import annotations

import base64
import io
import tempfile
import zipfile
from pathlib import Path

import requests
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from backend.lib.workspace import WorkspaceError, get_params, is_inside, require_base

router = APIRouter(prefix="/api/zip", tags=["zip"])

EXCLUDED_DIRS = {"node_modules", ".git", "__pycache__", ".venv", "venv"}
MAX_IMPORT_SIZE = 200 * 1024 * 1024  # 200 Mo


@router.get("/export")
async def export(request: Request):
    base = require_base(await get_params(request))
    if not base.exists():
        return JSONResponse(status_code=404, content={"error": "workspace not found"})

    tmp = tempfile.SpooledTemporaryFile(max_size=50 * 1024 * 1024)
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in base.rglob("*"):
            rel = path.relative_to(base)
            if any(part in EXCLUDED_DIRS for part in rel.parts):
                continue
            if path.is_file():
                zf.write(path, rel.as_posix())
    tmp.seek(0)

    def iterator():
        try:
            while chunk := tmp.read(64 * 1024):
                yield chunk
        finally:
            tmp.close()

    return StreamingResponse(
        iterator(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base.name}.zip"'},
    )


def _safe_extract(zf: zipfile.ZipFile, dest: Path) -> None:
    """Extraction avec protection zip-slip."""
    dest = dest.resolve()
    for member in zf.infolist():
        target = (dest / member.filename).resolve()
        if not is_inside(dest, target):
            raise WorkspaceError(f"Entrée zip interdite : {member.filename}", 400)
    zf.extractall(dest)


@router.post("/import")
async def import_zip(request: Request):
    p = await get_params(request)
    base = require_base(p)
    if not p.get("zipUrl") and not p.get("zipBase64"):
        return JSONResponse(status_code=400, content={"error": "zipUrl or zipBase64 required"})

    base.mkdir(parents=True, exist_ok=True)
    if p.get("zipUrl"):
        r = requests.get(p["zipUrl"], timeout=60)
        if not r.ok:
            raise RuntimeError("download failed")
        data = r.content
    else:
        data = base64.b64decode(p["zipBase64"])
    if len(data) > MAX_IMPORT_SIZE:
        return JSONResponse(status_code=413, content={"error": "zip trop volumineux"})

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        _safe_extract(zf, base)
    return {"ok": True, "path": str(base)}
