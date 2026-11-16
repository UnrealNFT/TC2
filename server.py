from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import threading
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv

# Charger les variables d'environnement AVANT les imports qui en dépendent
load_dotenv()

from agent import loop, tools
from agent.brain import repondre_conversation

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

executor = ThreadPoolExecutor(max_workers=1)
agent_lock = threading.Lock()

# État global
agent_running = False
agent_tours = []
current_workspace = ""

# Mémoire conversationnelle Ask par workspace (volatil RAM)
ask_sessions: dict[str, list[dict]] = {}
MAX_ASK_HISTORY = 20


class HistoryMsg(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str


class AskBody(BaseModel):
    question: str
    workspace: Optional[str] = "__global__"
    history: Optional[List[HistoryMsg]] = []
    file_content: Optional[str] = ""
    file_path: Optional[str] = ""


class RunBody(BaseModel):
    objectif: str
    workspace: Optional[str] = ""
    max_tours: Optional[int] = 20
    continu: Optional[bool] = False


class TaskBody(BaseModel):
    objectif: str
    workspace: Optional[str] = ""
    max_tours: Optional[int] = 20


class KimiBody(BaseModel):
    question: str


class FileWriteBody(BaseModel):
    path: str
    content: str
    workspace: Optional[str] = ""


def _callback(tour: int, decision: dict, narration: str):
    global agent_tours
    agent_tours.append({"tour": tour, "action": decision.get("action"), "pensee": narration})


def _run_agent(objectif: str, workspace: str, max_tours: int, continu: bool):
    global agent_running, current_workspace
    agent_running = True
    agent_tours.clear()
    try:
        if workspace:
            tools.initialize_root(workspace)
            current_workspace = workspace
        loop.boucle(objectif, max_tours=max_tours, callback=_callback, continu=continu)
    finally:
        agent_running = False


@app.get("/health")
async def health():
    return {"status": "ok", "agent_running": agent_running, "workspace": current_workspace}


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


@app.post("/files/write")
async def file_write(body: FileWriteBody):
    """Écrit un fichier n'importe où dans le workspace courant ou spécifié."""
    try:
        if body.workspace:
            tools.initialize_root(body.workspace)
        return {"status": "ok", "result": tools.write_file(body.path, body.content)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/files/read")
async def file_read(body: FileWriteBody):
    """Lit un fichier."""
    try:
        if body.workspace:
            tools.initialize_root(body.workspace)
        return {"status": "ok", "content": tools.read_file(body.path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ask")
async def ask(body: AskBody):
    """Discussion avec mémoire conversationnelle par workspace + contexte fichier."""
    try:
        session_key = body.workspace or "__global__"

        # Synchroniser session serveur avec historique client
        session = ask_sessions.setdefault(session_key, [])
        if body.history:
            for h in body.history[-10:]:
                entry = {"role": h.role, "content": h.content}
                if entry not in session[-10:]:
                    session.append(entry)

        # Brancher le contexte du fichier ouvert
        if body.file_path and body.file_content:
            fpath = body.file_path
            snippet = body.file_content[:2500]
            ok = True
            for i, m in enumerate(session[-6:]):
                if m.get("role") == "user" and f"Fichier ouvert : {fpath}" in str(m.get("content", "")):
                    ok = False
                    break
            if ok:
                session.append({
                    "role": "user",
                    "content": f"[Contexte fichier ouvert] {fpath}:\n{snippet}"
                })

        # Construire les messages pour le LLM
        messages = [m for m in session[-MAX_ASK_HISTORY:] if m["role"] in ("user", "assistant")]

        # Appel LLM avec mémoire
        contexte = _build_context(body.file_path or "", body.file_content or "", session_key)
        answer = repondre_conversation(messages, body.question, contexte)

        # Mettre à jour la mémoire
        session.append({"role": "user", "content": body.question})
        session.append({"role": "assistant", "content": answer})
        ask_sessions[session_key] = session[-MAX_ASK_HISTORY:]

        return {"final": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent/run")
async def run_agent(body: RunBody):
    global agent_running
    if agent_running:
        raise HTTPException(status_code=409, detail="Un agent est déjà en cours d'exécution.")
    if body.workspace:
        tools.initialize_root(body.workspace)
    loop_continu = asyncio.get_event_loop()
    await loop_continu.run_in_executor(
        executor,
        _run_agent,
        body.objectif,
        body.workspace or "",
        body.max_tours,
        body.continu,
    )
    summary = agent_tours[-1]["pensee"] if agent_tours else "Terminé."
    return {"resume": summary, "status": "ok", "tours": agent_tours}


@app.get("/agent/status")
async def status():
    return {"running": agent_running, "tours": agent_tours}


@app.post("/agent/stop")
async def stop_agent():
    loop.request_stop()
    return {"status": "ok", "message": "Arrêt demandé."}


@app.post("/agent/task")
async def task(body: TaskBody):
    """Ajoute une tâche à exécuter dès que l'agent actuel est libre."""
    if not agent_running:
        loop_task = asyncio.get_event_loop()
        await loop_task.run_in_executor(
            executor,
            _run_agent,
            body.objectif,
            body.workspace or "",
            body.max_tours,
            False,
        )
        return {"status": "started", "tours": agent_tours}
    return {"status": "queued", "detail": "Agent occupé, tâche mise en file d'attente."}


@app.post("/kimi")
async def kimi_review(body: KimiBody):
    """Proxy vers WaveSpeed pour éviter le CORS côté navigateur."""
    import requests  # import local volontaire

    api_key = os.getenv("WAVESPEED_API_KEY") or os.getenv("VITE_WAVESPEED_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Clé WaveSpeed non configurée sur le serveur.")

    try:
        response = requests.post(
            "https://llm.wavespeed.ai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": os.getenv("WAVESPEED_MODEL", "moonshotai/kimi-k2.7-code"),
                "messages": [
                    {
                        "role": "system",
                        "content": "Tu es un architecte senior. Réponds en français avec un plan court et des étapes concrètes. Pas de code complet.",
                    },
                    {"role": "user", "content": body.question[:4000]},
                ],
                "max_tokens": 800,
                "temperature": 0.4,
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        text = str(data.get("choices", [{}])[0].get("message", {}).get("content", "")).strip()
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur WaveSpeed: {e}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
