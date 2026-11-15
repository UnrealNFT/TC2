"""TrappistCode - backend unifié (FastAPI).

Remplace progressivement le serveur Express (server/) et server.py.
Lancement depuis la racine du repo :
    python -m backend.main
    # ou : uvicorn backend.main:app --reload --port 4269
"""
from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.lib.workspace import WorkspaceError
from backend.routes import files, git
from backend.routes.git import GitError

load_dotenv()

app = FastAPI(title="TrappistCode Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(WorkspaceError)
async def _workspace_error(_req: Request, exc: WorkspaceError):
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc)})


@app.exception_handler(GitError)
async def _git_error(_req: Request, exc: GitError):
    return JSONResponse(status_code=500, content={"error": str(exc)})


@app.exception_handler(Exception)
async def _generic_error(_req: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"error": str(exc) or exc.__class__.__name__})


app.include_router(files.router)
app.include_router(git.router)


@app.get("/health")
async def health():
    return {"status": "ok", "name": "trappistcode-backend", "platform": sys.platform}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "4269"))
    uvicorn.run("backend.main:app", host="127.0.0.1", port=port, reload=True)
