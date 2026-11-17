"""Routes de l'agent IA (port de server.py).

Mêmes chemins que server.py (/ask, /agent/*, /files/read|write) pour que
le frontend n'ait qu'à changer d'URL (port 8000 -> port unique) à l'étape 5.
Le package `agent/` reste à la racine du repo pour l'instant.
"""
from __future__ import annotations

import asyncio
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agent import loop, tools, models as agent_models
from agent.brain import repondre_conversation

router = APIRouter(tags=["agent"])

executor = ThreadPoolExecutor(max_workers=1)


class AgentState:
    running = False
    tours: list[dict] = []
    workspace = ""
    lock = threading.Lock()


state = AgentState()

# Mémoire conversationnelle Ask par workspace (volatile, RAM)
ask_sessions: dict[str, list[dict]] = {}
MAX_ASK_HISTORY = 20


class HistoryMsg(BaseModel):
    role: str
    content: str


class AskBody(BaseModel):
    question: str
    workspace: Optional[str] = "__global__"
    history: Optional[List[HistoryMsg]] = []
    file_content: Optional[str] = ""
    file_path: Optional[str] = ""
    model: Optional[str] = "gemma"


class RunBody(BaseModel):
    objectif: str
    workspace: Optional[str] = ""
    max_tours: Optional[int] = 20
    continu: Optional[bool] = False
    model: Optional[str] = "gemma"


class TaskBody(BaseModel):
    objectif: str
    workspace: Optional[str] = ""
    max_tours: Optional[int] = 20


class FileWriteBody(BaseModel):
    path: str
    content: Optional[str] = ""
    workspace: Optional[str] = ""


def _callback(tour: int, decision: dict, narration: str):
    state.tours.append({"tour": tour, "action": decision.get("action"), "pensee": narration})


def _run_agent(objectif: str, workspace: str, max_tours: int, continu: bool, model: str = "gemma"):
    with state.lock:
        state.running = True
        state.tours.clear()
    try:
        if workspace:
            tools.initialize_root(workspace)
            state.workspace = workspace
        loop.boucle(objectif, max_tours=max_tours, callback=_callback, continu=continu, model_key=model)
    finally:
        state.running = False


def _build_context(file_path: str, file_content: str, workspace: str) -> str:
    parts = []
    if workspace and workspace != "__global__":
        parts.append(f"Workspace actuel : {workspace}")
    if file_path:
        parts.append(f"Fichier ouvert : {file_path}")
        if file_content:
            parts.append(f"Contenu (extrait) :\n{file_content[:3000]}")
    try:
        files = tools.list_tree().splitlines()[:30]
        if files:
            parts.append("Structure du projet :")
            parts.extend(files)
    except Exception:
        pass
    return "\n".join(parts)


@router.get("/models")
async def list_models():
    """Renvoie la liste des modèles disponibles pour le sélecteur."""
    return {"models": agent_models.catalogue()}


@router.post("/files/write")
async def file_write(body: FileWriteBody):
    try:
        if body.workspace:
            tools.initialize_root(body.workspace)
        return {"status": "ok", "result": tools.write_file(body.path, body.content or "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/files/read")
async def file_read(body: FileWriteBody):
    try:
        if body.workspace:
            tools.initialize_root(body.workspace)
        return {"status": "ok", "content": tools.read_file(body.path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ask")
async def ask(body: AskBody):
    try:
        session_key = body.workspace or "__global__"
        session = ask_sessions.setdefault(session_key, [])
        if body.history:
            for h in body.history[-10:]:
                entry = {"role": h.role, "content": h.content}
                if entry not in session[-10:]:
                    session.append(entry)

        if body.file_path and body.file_content:
            marker = f"[Contexte fichier ouvert] {body.file_path}:"
            already = any(
                m.get("role") == "user" and str(m.get("content", "")).startswith(marker)
                for m in session[-6:]
            )
            if not already:
                session.append({"role": "user", "content": f"{marker}\n{body.file_content[:2500]}"})

        messages = [m for m in session[-MAX_ASK_HISTORY:] if m["role"] in ("user", "assistant")]
        contexte = _build_context(body.file_path or "", body.file_content or "", session_key)
        answer = await asyncio.to_thread(repondre_conversation, messages, body.question, contexte, body.model)

        session.append({"role": "user", "content": body.question})
        session.append({"role": "assistant", "content": answer})
        ask_sessions[session_key] = session[-MAX_ASK_HISTORY:]
        return {"final": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent/run")
async def run_agent(body: RunBody):
    if state.running:
        raise HTTPException(status_code=409, detail="Un agent est déjà en cours d'exécution.")
    await asyncio.get_running_loop().run_in_executor(
        executor, _run_agent, body.objectif, body.workspace or "", body.max_tours, body.continu, body.model,
    )
    summary = state.tours[-1]["pensee"] if state.tours else "Terminé."
    return {"resume": summary, "status": "ok", "tours": state.tours}


@router.get("/agent/status")
async def agent_status():
    return {"running": state.running, "tours": state.tours, "workspace": state.workspace}


@router.post("/agent/stop")
async def stop_agent():
    loop.request_stop()
    return {"status": "ok", "message": "Arrêt demandé."}


@router.post("/agent/task")
async def task(body: TaskBody):
    if not state.running:
        await asyncio.get_running_loop().run_in_executor(
            executor, _run_agent, body.objectif, body.workspace or "", body.max_tours, False, "gemma",
        )
        return {"status": "started", "tours": state.tours}
    return {"status": "queued", "detail": "Agent occupé, tâche mise en file d'attente."}
