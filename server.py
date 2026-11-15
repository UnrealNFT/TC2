@app.get("/agent/status")
async def agent_status():
    return {"running": AGENT_RUNNING, "tours": list(TOURS)}
