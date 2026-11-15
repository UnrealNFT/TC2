from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import threading
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor

from agent import loop, tools
from agent.brain import chat_classifier, kimi_final_review

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


class AskBody(BaseModel):
    question: str
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


@app.post("/ask")
async def ask(body: AskBody):
    """Question simple ou requête rapide sans lancer un agent complet."""
    try:
        category = chat_classifier.classify(body.question)
        if category == "chat":
            return {"final": chat_classifier.answer(body.question)}
        # Sinon, exécution directe d'une instruction simple
        return {"final": f"Mode code détecté. Pour exécuter : POST /agent/run avec workspace."}
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


@app.post("/agent/task")
async def task(body: TaskBody):
    """Ajoute une tâche à exécuter dès que l'agent actuel est libre."""
    if not agent_running:
        # Lancer immédiatement
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
