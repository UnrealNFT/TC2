from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import threading
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor

from agent import loop, tools
from agent.brain import chat_classifier, kimi_final_review, discuter, decider

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


def _systeme_ask() -> str:
    return (
        "Tu es TrappistCode, l'assistant de développement de l'utilisateur. "
        "Tu as accès au contexte du projet. "
        "Réponds en français de façon naturelle, concise, utile. "
        "Si la question porte sur le code, explique ou propose directement. "
        "Si la demande nécessite de modifier/créer/supprimer des fichiers, dis-le explicitement. "
        "Tu conserveras le fil de la conversation grâce à l'historique."
    )


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


@app.post("/ask")
async def ask(body: AskBody):
    """Discussion avec mémoire conversationnelle par workspace + contexte fichier."""
    try:
        session_key = body.workspace or "__global__"

        # Initialiser / enrichir la session serveur
        session = ask_sessions.setdefault(session_key, [])
        # on merge l'historique client (si présent) avec la session serveur
        if body.history:
            for h in body.history[-10:]:
                if {'role': h.role, 'content': h.content} not in [dict(m) for m in session[-10:]]:
                    session.append({"role": h.role, "content": h.content})

        contexte = _build_context(body.file_path or "", body.file_content or "", session_key)

        messages = [
            {"role": "system", "content": _systeme_ask()},
        ]
        # historique conversationnel (user / assistant) avant la question en cours
        for m in session[-MAX_ASK_HISTORY:]:
            role = m.get("role", "user")
            if role not in ("user", "assistant"):
                continue
            messages.append({"role": role, "content": m.get("content", "")})

        # ajout contexte + question
        prompt = body.question
        if contexte:
            prompt = f"[Contexte projet]\n{contexte}\n\n[Question]\n{body.question}"
        messages.append({"role": "user", "content": prompt})

        # Classification fallback
        classification = chat_classifier.classify(body.question)
        if classification == "chat":
            answer = discuter(body.question)
        else:
            # Code / projet : on donne un avis/explication en s'appuyant sur le contexte
            answer = discuter(
                f"Réponds comme un assistant de code. Contexte: {contexte[:2000] if contexte else 'aucun'}.\n\nQuestion: {body.question}"
            )

        # Mise à jour de la mémoire
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
