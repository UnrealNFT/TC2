# pyright: reportMissingImports=false
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from collections import deque
import os
import ollama

from agent import loop as agent_loop
from agent import tools

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELE_CERVEAU = "hf.co/mradermacher/DeepSeek-V4-Pro-Qwen3.5-9B-UNCENSORED-heretic-i1-GGUF:Q4_K_M"
MODELE_RELECTEUR = "huihui_ai/qwen3-abliterated:8b"

# Stockage des tours
TOURS = deque(maxlen=100)

class AskRequest(BaseModel):
    question: str
    system: str = ""
    file_content: str = ""
    file_path: str = ""

class AgentRequest(BaseModel):
    objectif: str
    max_tours: int = 0

@app.post("/ask")
async def ask(req: AskRequest):
    system = req.system or "You are a precise coding assistant in TrappistCode."

    file_context = ""
    if req.file_path and req.file_content:
        content = req.file_content
        if len(content) > 5000:
            file_context = f"\n\nFichier : {req.file_path} (extrait)\n```\n{content[:3500]}\n```"
        else:
            file_context = f"\n\nFichier ouvert : {req.file_path}\n```\n{content}\n```"

    strict = """
RÈGLES STRICTES :
- Fais des modifications très ciblées.
- Utilise un bloc ```edit_buffer avec le texte EXACT à remplacer.
- Ne réécris pas tout le fichier.
- Réponds en français.
- Si tu veux modifier, tu DOIS utiliser le format edit_buffer.
"""

    messages = [
        {"role": "system", "content": system + file_context + strict},
        {"role": "user", "content": req.question}
    ]

    max_loops = 4
    final_answer = ""
    reasoning = ""
    loops_done = 0

    for i in range(max_loops):
        loops_done = i + 1

        brain = ollama.chat(
            model=MODELE_CERVEAU,
            messages=messages,
            options={"num_ctx": 8192, "temperature": 0.25}
        )
        reasoning = brain["message"]["content"]

        review_prompt = f"""Question : {req.question}

Réponse du cerveau :
{reasoning}

---
Ton rôle :
1. Vérifie si la réponse contient un bloc edit_buffer ou set_buffer correct.
2. Si oui → améliore légèrement et renvoie la version finale.
3. Si non → explique clairement ce qui manque et demande une correction précise.
Réponds en français."""

        review = ollama.chat(
            model=MODELE_RELECTEUR,
            messages=[
                {"role": "system", "content": "Tu es un relecteur strict. Tu vérifies les modifications de code et tu forces le bon format."},
                {"role": "user", "content": review_prompt}
            ],
            options={"num_ctx": 8192, "temperature": 0.2}
        )
        final_answer = review["message"]["content"]

        if "```edit_buffer" in final_answer or "```set_buffer" in final_answer:
            break

        messages.append({"role": "assistant", "content": reasoning})
        messages.append({
            "role": "user",
            "content": f"Feedback du relecteur :\n{final_answer}\n\nCorrige et renvoie un vrai bloc edit_buffer avec le texte exact."
        })

    return {
        "reasoning": reasoning,
        "final": final_answer,
        "loops": loops_done
    }

def callback(tour: int, action: dict, resultat: str):
    pensee = action.get("pensee", "")
    action_name = action.get("action", "?")
    if pensee:
        msg = f"[Tour {tour}] {pensee}"
    else:
        msg = f"[Tour {tour}] {action_name} → {str(resultat)[:120]}"
    TOURS.append(msg)
    print(msg)

@app.post("/agent/run")
async def run_agent(req: AgentRequest):
    TOURS.clear()
    max_t = req.max_tours if req.max_tours > 0 else 9999

    resume = agent_loop.boucle(
        objectif=req.objectif,
        max_tours=max_t,
        commit_chaque=5,
        callback=callback
    )
    return {"resume": resume, "status": "done", "tours": list(TOURS)}

@app.get("/agent/status")
async def agent_status():
    return {"tours": list(TOURS)}

@app.post("/agent/task")
async def add_task(req: AgentRequest):
    tasks_file = os.path.join(tools.ROOT, "tasks.txt")
    with open(tasks_file, "a", encoding="utf-8") as f:
        f.write(req.objectif.strip() + "\n")
    return {"status": "added", "message": "Tâche ajoutée au daemon"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)