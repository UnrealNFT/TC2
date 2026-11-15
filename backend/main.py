"""TrappistCode - backend unifié (FastAPI).

Remplace le serveur Express (server/) ET server.py.
Lancement depuis la racine du repo :
    python -m backend.main
    # ou : uvicorn backend.main:app --reload --port 4269
"""
from __future__ import annotations

import logging
import os
import sys

from dotenv import load_dotenv

# Charger le .env AVANT les imports qui en dépendent (agent/)
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.lib.workspace import WorkspaceError
from backend.routes import files, git, preview, search, shell, templates, zip as zip_routes
from backend.routes.git import GitError

log = logging.getLogger("trappist")

app = FastAPI(title="TrappistCode Backend", version="0.2.0")

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


# --- Routes IDE (ex-Express) ---
for r in (files, git, preview, shell, templates, search, zip_routes):
    app.include_router(r.router)

# --- Routes agent IA (ex-server.py) ---
agent_state = None
try:
    from backend.routes import agent as agent_routes

    app.include_router(agent_routes.router)
    agent_state = agent_routes.state
except Exception as e:  # l'IDE reste utilisable même si l'agent ne charge pas
    log.warning("Agent IA non chargé : %s", e)
    AGENT_ERROR = str(e)
else:
    AGENT_ERROR = None


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "name": "trappistcode-backend",
        "platform": sys.platform,
        "agent": "error" if AGENT_ERROR else "ok",
        "agent_error": AGENT_ERROR,
        "agent_running": bool(agent_state and agent_state.running),
        "workspace": agent_state.workspace if agent_state else "",
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "4269"))
    uvicorn.run("backend.main:app", host="127.0.0.1", port=port, reload=True)
