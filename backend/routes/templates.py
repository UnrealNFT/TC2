"""Routes /api/templates : création de projets (port de server/routes/templates.js)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.lib.workspace import get_params, require_base, safe_join

router = APIRouter(prefix="/api/templates", tags=["templates"])

TEMPLATES: dict[str, dict[str, str]] = {
    "vanilla": {
        "index.html": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Trappist Project</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>Hello TrappistCode</h1>
  <script src="main.js"></script>
</body>
</html>""",
        "style.css": """body {
  background: #000;
  color: #00ff41;
  font-family: 'Courier New', monospace;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  margin: 0;
}""",
        "main.js": "console.log('TrappistCode ready')",
    },
    "react": {
        "index.html": """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Trappist React</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.jsx"></script>
</body>
</html>""",
        "main.jsx": """import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
""",
        "App.jsx": """export default function App() {
  return <h1 style={{ color: '#00ff41', background: '#000', height: '100vh', margin: 0 }}>Trappist React</h1>
}
""",
        "package.json": json.dumps({
            "name": "trappist-project", "private": True, "type": "module",
            "scripts": {"dev": "vite"},
            "dependencies": {"react": "^19.0.0", "react-dom": "^19.0.0"},
            "devDependencies": {"vite": "^6.0.0"},
        }, indent=2),
    },
    "node": {
        "index.js": "console.log('Trappist Node ready')",
        "package.json": json.dumps({
            "name": "trappist-project", "private": True, "type": "module",
            "scripts": {"start": "node index.js"},
        }, indent=2),
    },
}


@router.get("/list")
async def list_templates():
    return list(TEMPLATES.keys())


@router.post("/create")
async def create(request: Request):
    p = await get_params(request)
    base = require_base(p)
    name, template = p.get("name"), p.get("template")
    if not name or template not in TEMPLATES:
        return JSONResponse(status_code=400, content={"error": "name or template invalid"})
    project = safe_join(base, name)
    for rel, content in TEMPLATES[template].items():
        full = safe_join(project, rel)
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(content, encoding="utf-8")
    return {"ok": True, "path": str(project)}
