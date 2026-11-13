"""Outils de l'agent TrappistCode : fichiers, shell, git complet, GitHub, recherche, TrappistAI."""
import os, json, subprocess, urllib.request, urllib.error, urllib.parse
from typing import Optional

ROOT = os.path.abspath(os.environ.get("AGENT_ROOT", os.getcwd()))


def _safe(path: str) -> str:
    root = os.path.abspath(ROOT)
    p = os.path.abspath(os.path.join(root, path))
    try:
        if os.path.commonpath([root, p]) != root:
            raise ValueError(f"Chemin hors projet: {path}")
    except ValueError:
        raise ValueError(f"Chemin hors projet: {path}")
    return p


def read_file(path: str) -> str:
    with open(_safe(path), encoding="utf-8") as f:
        return f.read()


def write_file(path: str, content: str) -> str:
    p = _safe(path)
    d = os.path.dirname(p)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    return f"OK {path} ({len(content)} car.)"


def delete_file(path: str) -> str:
    os.remove(_safe(path))
    return f"Supprimé: {path}"


def list_files() -> str:
    out = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in (".git", "node_modules", "__pycache__", "dist", ".agent")]
        for f in fn:
            out.append(os.path.relpath(os.path.join(dp, f), ROOT))
    return "\n".join(sorted(out)[:500]) or "(dossier vide)"


def shell(cmd: str, timeout: int = 180) -> str:
    try:
        r = subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        return ((r.stdout or "") + (r.stderr or "")).strip()[:4000] or "(rien)"
    except subprocess.TimeoutExpired:
        return f"TIMEOUT ({timeout}s): {cmd}"


def git(args: str) -> str:
    return shell("git " + args)


def _ensure_git() -> None:
    if not os.path.exists(os.path.join(ROOT, ".git")):
        shell("git init")
        shell("git branch -M main")


def _ensure_remote(url: Optional[str] = None) -> None:
    if "origin" in shell("git remote"):
        return
    origin = url or os.environ.get("GIT_ORIGIN", "")
    if origin:
        shell(f"git remote add origin {origin}")


def commit_push(message: str, remote_url: Optional[str] = None) -> str:
    _ensure_git()
    _ensure_remote(remote_url)
    shell("git add -A")
    safe = (message or "agent: avancement").replace('"', "'")
    commit = shell(f'git commit -m "{safe}"')
    if "origin" not in shell("git remote"):
        return f"Commit local : {commit[:400]}\nPush : aucun remote, rien envoyé."
    push = shell("git push -u origin main")
    if "no upstream" in push.lower() or "has no upstream" in push.lower():
        push = shell("git push --set-upstream origin main")
    return f"Commit: {commit[:400]}\nPush: {push[:400]}"


def create_github_repo(name: str, private: bool = False, description: str = "") -> str:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("VITE_GITHUB_TOKEN")
    if not token:
        return "Erreur: GITHUB_TOKEN manquant dans l'environnement"

    url = "https://api.github.com/user/repos"
    payload = {"name": name, "private": private, "description": description, "auto_init": False}
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"token {token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "User-Agent": "TrappistCode-Agent",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode())
            clone_url = result.get("clone_url", "")
            html_url = result.get("html_url", "")
            _ensure_git()
            shell("git remote remove origin 2>nul || true")
            if clone_url:
                shell(f"git remote add origin {clone_url}")
            return f"Repo créé: {html_url}\nRemote configuré: {clone_url}"
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        return f"Erreur GitHub ({e.code}): {body}"
    except Exception as e:
        return f"Erreur: {e}"


def set_root(path: str) -> str:
    global ROOT
    new_root = os.path.abspath(path.strip().strip('"'))
    os.makedirs(new_root, exist_ok=True)
    ROOT = new_root
    os.chdir(ROOT)
    return f"Dossier de travail changé : {ROOT}"


def clone_repo(url: str, folder: Optional[str] = None) -> str:
    if not folder:
        folder = url.rstrip("/").split("/")[-1].replace(".git", "")
    target = os.path.join(os.path.dirname(ROOT), folder)
    result = shell(f'git clone {url} "{target}"')
    return f"Clone : {result[:500]}\nDossier : {target}"


def web_search(query: str) -> str:
    try:
        url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        results = []
        for line in html.split("\n"):
            if "result__a" in line and "href" in line:
                results.append(line.strip()[:250])
            if len(results) >= 6:
                break
        return "\n".join(results) if results else "Aucun résultat clair."
    except Exception as e:
        return f"Erreur recherche web: {e}"


def github_search(query: str, search_type: str = "repositories") -> str:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("VITE_GITHUB_TOKEN")
    url = f"https://api.github.com/search/{search_type}?q={urllib.parse.quote(query)}&per_page=5"
    headers = {"Accept": "application/vnd.github.v3+json", "User-Agent": "TrappistCode"}
    if token:
        headers["Authorization"] = f"token {token}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        items = data.get("items", [])
        if not items:
            return "Aucun résultat GitHub."
        lines = []
        for item in items[:5]:
            name = item.get("full_name") or item.get("name", "")
            url_item = item.get("html_url", "")
            desc = (item.get("description") or "")[:120]
            lines.append(f"- {name} | {url_item} | {desc}")
        return "\n".join(lines)
    except Exception as e:
        return f"Erreur GitHub search: {e}"


def x_search(query: str) -> str:
    return f"Recherche X pour '{query}' : à brancher avec l'API X."


def telegram_search(query: str) -> str:
    return f"Recherche Telegram pour '{query}' : à brancher avec un bot Telegram."


def trappist_generate(kind: str, prompt: str, out_path: str) -> str:
    url = os.environ.get("TRAPPIST_API", "http://localhost:9000/generate")
    body = json.dumps({"kind": kind, "prompt": prompt}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = resp.read()
        p = _safe(out_path)
        d = os.path.dirname(p)
        if d:
            os.makedirs(d, exist_ok=True)
        with open(p, "wb") as f:
            f.write(data)
        return f"Asset {kind} -> {out_path} ({len(data)} octets)"
    except Exception as e:
        return f"Erreur génération: {e}"


TOOLS = {
    "read_file": read_file,
    "write_file": write_file,
    "delete_file": delete_file,
    "list_files": list_files,
    "shell": shell,
    "git": git,
    "commit_push": commit_push,
    "create_github_repo": create_github_repo,
    "set_root": set_root,
    "clone_repo": clone_repo,
    "web_search": web_search,
    "github_search": github_search,
    "x_search": x_search,
    "telegram_search": telegram_search,
    "trappist_generate": trappist_generate,
}