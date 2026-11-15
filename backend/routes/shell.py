"""Route /api/shell/run : exécution de commande (port de server/routes/shell.js).

Version transitoire, même comportement qu'Express (réponse à la fin de la commande).
Sera remplacée à l'étape 3 par un vrai terminal PTY via WebSocket.
"""
from __future__ import annotations

import asyncio
import os
import shlex
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.lib.workspace import decode_base, get_params

router = APIRouter(prefix="/api/shell", tags=["shell"])

ALLOWED_COMMANDS = {
    "npm", "node", "npx", "yarn", "pnpm", "git", "python", "python3",
    "tsc", "oxlint", "powershell", "cmd", "bash", "sh",
}
BLOCKED_CHARS = ("&&", "||", ";", "|", "<", ">", "`", "$", "{", "}")
TIMEOUT = 300


def _is_safe(cmd: str, args: list[str]) -> bool:
    if cmd not in ALLOWED_COMMANDS:
        return False
    return not any(b in a for a in args for b in BLOCKED_CHARS)


def _run(cmd: str, args: list[str], cwd: Path) -> dict:
    try:
        proc = subprocess.run(
            [cmd, *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=TIMEOUT,
            shell=sys.platform == "win32",
        )
        return {"code": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}
    except subprocess.TimeoutExpired as e:
        return {"code": -1, "stdout": e.stdout or "", "stderr": f"Timeout après {TIMEOUT}s"}
    except FileNotFoundError:
        return {"code": 127, "stdout": "", "stderr": f"Commande introuvable : {cmd}"}


@router.post("/run")
async def run(request: Request):
    p = await get_params(request)
    command = p.get("command")
    if not command or not isinstance(command, str):
        return JSONResponse(status_code=400, content={"error": "command required"})

    parts = shlex.split(command, posix=sys.platform != "win32")
    cmd = parts[0]
    args = [str(a) for a in [*parts[1:], *(p.get("args") or [])] if a]
    if not _is_safe(cmd, args):
        return JSONResponse(status_code=403, content={"error": "Command not allowed"})

    cwd = (
        decode_base(p.get("base"))
        or decode_base(os.getenv("TRAPPIST_WORKSPACE"))
        or Path.cwd()
    )
    return await asyncio.to_thread(_run, cmd, args, cwd)
