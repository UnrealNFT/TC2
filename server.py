# pyright: reportMissingImports=false
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os

import agent.loop as agent_loop

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    objectif: str
    workspace: str = ""
    max_tours: int = 20


latest_status = {"running": False, "tours": []}


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/agent/status")
def agent_status():
    return latest_status


@app.post("/agent/run")
def agent_run(req: RunRequest):
    import agent.tools as tools
    if req.workspace:
        tools.ROOT = os.path.abspath(req.workspace)
    else:
        tools.ROOT = os.path.abspath(os.getcwd())
    latest_status["running"] = True
    latest_status["tours"] = []

    def callback(t, a, r):
        latest_status["tours"].append({
            "tour": t,
            "action": a.get("action"),
            "args": a.get("args"),
            "pensee": a.get("pensee", ""),
            "resultat": str(r)[:500]
        })

    result = agent_loop.run(req.objectif, max_tours=req.max_tours)
    latest_status["running"] = False
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
