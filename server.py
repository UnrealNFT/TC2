# pyright: reportMissingImports=false
import os
import re
import asyncio
import threading
import requests
import ollama
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from collections import deque

from agent import loop as agent_loop
from agent import tools

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KIMI_ENABLED = True
MODELE_CERVEAU = "satgeze/gemma4-12b-uncensored-1m"

TOURS = deque(maxlen=100)
AGENT_LOCK = threading.Lock()
AGENT_RUNNING = False

BUILD_WORDS = (
    "constru", "cré", "cree", "modif", "amélio", "amelio", "code", "fichier",
    "appli", "app ", "application", "commit", "push", "dossier", "ecris", "écris",
)
CONTINU_WORDS = (
    "toujours", "de plus en plus", "en continu", "sans arrêt", "sans arret", "h24", "24h", "24/24",
)


class AskRequest(BaseModel):
    question: str
    system: str = ""
    file_content: str = ""
    file_path: str = ""


class AgentRequest(BaseModel):
    objectif: str
    workspace: str = ""
    max_tours: int = 20


def _set_workspace(path: str = ""):
    """Initialise le dossier de travail de l'agent."""
    if path:
        tools.set_root(path)
    else:
        tools.ROOT = os.path.abspath(os.environ.get("TRAPPIST_WORKSPACE", os.getcwd()))
        os.makedirs(tools.ROOT, exist_ok=True)


def extraire_dossier(question: str) -> str:
    m = re.search(r"[A-Za-z]:\\[^\r\n\"']+", question or "")
    if not m:
        return ""
    return m.group(0).strip().split(" ", 1)[0].rstrip("\\.,;:")


def _propre(texte: str) -> str:
    texte = (texte or "").strip()
    if any(k in texte for k in ("Persona:", "Draft", "Selected response", "Self-correction")):
        parts = [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]
        texte = parts[-1] if parts else texte
        texte = re.sub(r"(?is)^(\*+\s*)?(selected response|réponse)\s*:\s*", "", texte).strip()
    return texte[:1200]


def call_kimi(question: str) -> str:
    if not KIMI_ENABLED:
        return ""
    api_key = os.getenv("WAVESPEED_API_KEY")
    if not api_key:
        print("[Kimi] pas de clé, on continue sans")
        return ""
    print("[Kimi] appel...")
    try:
        response = requests.post(
            "https://llm.wavespeed.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "moonshotai/kimi-k2.7-code",
                "messages": [
                    {"role": "system", "content": "Architecte. Plan court en étapes, sans code complet."},
                    {"role": "user", "content": question[:4000]},
                ],
                "max_tokens": 800,
            },
            timeout=40,
        )
        response.raise_for_status()
        plan = response.json()["choices"][0]["message"]["content"]
        print("[Kimi] plan reçu")
        return plan
    except Exception as e:
        print(f"[Kimi] {e}")
        return ""


def reponse_gemma(question: str, file_path: str, file_content: str) -> str:
    ctx = ""
    if file_path:
        ctx = f"\nFichier ouvert : {file_path}\n```\n{(file_content or '')[:2500]}\n```"
    messages = [
        {
            "role": "system",
            "content": (
                "Tu es l'assistant de TrappistCode. Français, 2 à 5 phrases. "
                "Uniquement la réponse finale. Pas de brouillon, pas de Persona, pas de Draft."
            ),
        },
        {"role": "user", "content": question + ctx + "\n/no_think"},
    ]
    options = {"num_ctx": 4096, "num_predict": 400, "temperature": 0.4}
    try:
        r = ollama.chat(model=MODELE_CERVEAU, messages=messages, think=False, options=options)
    except TypeError:
        r = ollama.chat(model=MODELE_CERVEAU, messages=messages, options=options)
    msg = r.get("message") or {}
    return _propre(msg.get("content") or msg.get("thinking") or "") or "Je suis là."


def classer(question: str, file_path: str, file_content: str) -> dict:
    msg = question.strip().lower()
    path = extraire_dossier(question)
    continu = any(w in msg for w in CONTINU_WORDS)

    if len(msg) < 24 and not path and any(w in msg for w in ("yo", "salut", "bonjour", "hey", "coucou", "hello", "ça va", "ca va", "merci")):
        return {"mode": "chat", "kimi": False, "continu": False, "path": "", "reply": "Yo. Dis-moi ce que tu veux construire ou modifier."}

    if any(w in msg for w in BUILD_WORDS) or path:
        kimi = any(w in msg for w in ("kimi", "appli", "application", "projet"))
        reply = "Je construis ça, puis je continue." if continu else "Je m'en occupe. Les tours s'affichent ici."
        return {"mode": "code", "kimi": kimi, "continu": continu, "path": path, "reply": reply}

    return {"mode": "chat", "kimi": False, "continu": False, "path": "", "reply": reponse_gemma(question, file_path, file_content)}


def callback(tour: int, action: dict, resultat: str):
    nom = action.get("action", "?")
    ligne = f"[Tour {tour}] {nom} -> {str(resultat)[:160]}"
    print(ligne)
    TOURS.append({"tour": tour, "action": nom, "pensee": ligne})


def lancer_agent(objectif: str, continu: bool, use_kimi: bool, path: str, workspace: str = "", max_tours: int = 20):
    global AGENT_RUNNING
    try:
        _set_workspace(workspace or path)
        plan = call_kimi(objectif) if use_kimi else ""
        full = objectif
        if plan:
            full += "\n\nPLAN KIMI, à suivre. Tu écris les fichiers toi-même, un par un :\n" + plan[:2000]
        agent_loop.boucle(full, max_tours=max_tours, commit_chaque=5, callback=callback, continu=continu)
    except Exception as e:
        ligne = f"[erreur] {e}"
        TOURS.append({"tour": 0, "action": "erreur", "pensee": ligne})
        print(ligne)
    finally:
        with AGENT_LOCK:
            AGENT_RUNNING = False
        TOURS.append({"tour": 0, "action": "done", "pensee": "[agent] objectif terminé"})
        print("[agent] objectif terminé")


def _texte_tours() -> str:
    lignes = []
    for t in TOURS:
        if isinstance(t, dict):
            lignes.append(t.get("pensee") or t.get("action") or "")
        else:
            lignes.append(str(t))
    return "\n".join(lignes) or "Terminé."


@app.post("/ask")
async def ask(req: AskRequest):
    global AGENT_RUNNING
    decision = classer(req.question, req.file_path, req.file_content)

    if decision["mode"] == "chat":
        return {"response": decision["reply"], "final": decision["reply"], "reasoning": decision["reply"], "mode": "chat"}

    with AGENT_LOCK:
        if AGENT_RUNNING:
            with open(os.path.join(tools.ROOT, "tasks.txt"), "a", encoding="utf-8") as f:
                f.write(req.question.strip() + "\n")
            reply = "Je suis déjà en train de coder. Je prends ça juste après."
            return {"response": reply, "final": reply, "reasoning": reply, "mode": "code", "status": "queued"}
        AGENT_RUNNING = True
        TOURS.clear()

    if decision["continu"]:
        threading.Thread(
            target=lancer_agent,
            args=(req.question, True, decision["kimi"], decision["path"], "", 20),
            daemon=True,
        ).start()
        return {"response": decision["reply"], "final": decision["reply"], "reasoning": decision["reply"], "mode": "code", "status": "running"}

    await asyncio.to_thread(lancer_agent, req.question, False, decision["kimi"], decision["path"], "", 20)
    texte = _texte_tours()
    return {"response": texte, "final": texte, "reasoning": texte, "mode": "code", "status": "done"}


@app.post("/agent/run")
async def run_agent(req: AgentRequest):
    global AGENT_RUNNING
    TOURS.clear()
    with AGENT_LOCK:
        AGENT_RUNNING = True
    mt = req.max_tours if req.max_tours and req.max_tours > 0 else 20
    await asyncio.to_thread(lancer_agent, req.objectif, False, False, "", req.workspace, mt)
    return {"resume": _texte_tours(), "status": "done", "tours": list(TOURS)}


@app.get("/agent/status")
async def agent_status():
    return {"running": AGENT_RUNNING, "tours": list(TOURS)}


@app.post("/agent/task")
async def add_task(req: AgentRequest):
    with open(os.path.join(tools.ROOT, "tasks.txt"), "a", encoding="utf-8") as f:
        f.write(req.objectif.strip() + "\n")
    return {"status": "added"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
