"""Routes /api/git : port de server/routes/git.js via le binaire `git` (sans dépendance)."""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

from fastapi import APIRouter, Request

from backend.lib.workspace import get_params, require_base

router = APIRouter(prefix="/api/git", tags=["git"])


class GitError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


# Messages git bruts -> explication lisible pour l'utilisateur
_TRADUCTIONS = [
    (("does not appear to be a git repository", "no configured push destination", "no such remote"),
     "Aucun remote configuré. Crée un repo sur GitHub puis : git remote add origin https://github.com/<toi>/<repo>.git"),
    (("nothing to commit", "nothing added to commit", "no changes added to commit"),
     "Rien à committer : modifie un fichier puis clique sur « Stage all » avant de committer."),
    (("has no upstream branch",),
     "La branche n'a pas d'upstream. Lance une fois : git push -u origin <branche>"),
    (("authentication failed", "could not read username", "permission denied", "403"),
     "Authentification GitHub refusée : vérifie ton token / tes identifiants git."),
    (("rejected", "fetch first", "non-fast-forward"),
     "Push refusé : le remote a des commits que tu n'as pas. Fais un Pull d'abord."),
    (("please tell me who you are", "unable to auto-detect email"),
     "Identité git manquante : git config --global user.name \"Nom\" et git config --global user.email \"mail\""),
    (("conflict",),
     "Conflit de fusion : résous les conflits dans les fichiers puis committe."),
]


def _traduire(brut: str) -> str:
    bas = brut.lower()
    for motifs, message in _TRADUCTIONS:
        if any(m in bas for m in motifs):
            return f"{message}\n(git : {brut.splitlines()[0][:200]})"
    return brut


def run_git(base: Path, *args: str) -> str:
    try:
        proc = subprocess.run(
            ["git", *args],
            cwd=str(base),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
        )
    except FileNotFoundError as e:
        raise GitError("git introuvable dans le PATH", 500) from e
    except subprocess.TimeoutExpired as e:
        raise GitError(f"git {' '.join(args)} : timeout", 504) from e
    if proc.returncode != 0:
        brut = (proc.stderr or proc.stdout).strip() or f"git {' '.join(args)} a échoué"
        raise GitError(_traduire(brut))
    return proc.stdout


def is_repo(base: Path) -> bool:
    return (base / ".git").exists()


def parse_status(output: str) -> dict:
    res = {
        "branch": None, "tracking": None, "ahead": 0, "behind": 0,
        "modified": [], "not_added": [], "deleted": [], "renamed": [],
        "created": [], "staged": [],
    }
    for line in output.splitlines():
        if line.startswith("## "):
            head = line[3:]
            info = ""
            if " [" in head and head.endswith("]"):
                head, _, info = head.partition(" [")
                info = info[:-1]
            for prefix in ("No commits yet on ", "Initial commit on "):
                if head.startswith(prefix):
                    head = head[len(prefix):]
            branch, _, tracking = head.partition("...")
            res["branch"] = branch or None
            res["tracking"] = tracking or None
            a = re.search(r"ahead (\d+)", info)
            b = re.search(r"behind (\d+)", info)
            res["ahead"] = int(a.group(1)) if a else 0
            res["behind"] = int(b.group(1)) if b else 0
            continue
        if len(line) < 4:
            continue
        x, y, path = line[0], line[1], line[3:]
        if x == "?" and y == "?":
            res["not_added"].append(path)
            continue
        if x == "R":
            old, _, new = path.partition(" -> ")
            res["renamed"].append({"from": old, "to": new})
            path = new
        if x == "A":
            res["created"].append(path)
        if "M" in (x, y):
            res["modified"].append(path)
        if "D" in (x, y):
            res["deleted"].append(path)
        if x in "MADRC" and x != " ":
            res["staged"].append(path)
    return res


@router.get("/status")
async def status(request: Request):
    base = require_base(await get_params(request))
    if not is_repo(base):
        return {"isRepo": False, "branch": None, "isClean": True, "modified": []}
    s = parse_status(run_git(base, "status", "--porcelain=v1", "-b", "-uall"))
    is_clean = not any(s[k] for k in ("modified", "not_added", "deleted", "renamed", "created", "staged"))
    return {"isRepo": True, **s, "isClean": is_clean}


@router.get("/diff")
async def diff(request: Request):
    p = await get_params(request)
    base = require_base(p)
    if not is_repo(base):
        return {"diff": ""}
    args = ["diff"] + (["--", p["path"]] if p.get("path") else [])
    return {"diff": run_git(base, *args)}


@router.get("/diff-staged")
async def diff_staged(request: Request):
    base = require_base(await get_params(request))
    if not is_repo(base):
        return {"diff": ""}
    return {"diff": run_git(base, "diff", "--cached")}


@router.post("/add")
async def add(request: Request):
    p = await get_params(request)
    run_git(require_base(p), "add", "--", p.get("path") or ".")
    return {"ok": True}


@router.post("/unstage")
async def unstage(request: Request):
    p = await get_params(request)
    run_git(require_base(p), "reset", "HEAD", "--", p.get("path") or ".")
    return {"ok": True}


@router.post("/commit")
async def commit(request: Request):
    p = await get_params(request)
    base = require_base(p)
    run_git(
        base, "commit",
        "-m", p.get("message") or "TrappistCode update",
        f"--author={p.get('author') or 'TrappistCode Agent <agent@trappist.land>'}",
    )
    sha = run_git(base, "rev-parse", "--short", "HEAD").strip()
    return {"ok": True, "commit": sha}


def _verifier_remote(base: Path, remote: str):
    remotes = run_git(base, "remote").split()
    if remote not in remotes:
        raise GitError(
            f"Aucun remote « {remote} » configuré. Crée un repo sur GitHub puis : "
            f"git remote add {remote} https://github.com/<toi>/<repo>.git"
        )


@router.post("/push")
async def push(request: Request):
    p = await get_params(request)
    base = require_base(p)
    remote = p.get("remote") or "origin"
    _verifier_remote(base, remote)
    run_git(base, "push", remote, p.get("branch") or "HEAD")
    return {"ok": True}


@router.post("/pull")
async def pull(request: Request):
    p = await get_params(request)
    base = require_base(p)
    remote = p.get("remote") or "origin"
    _verifier_remote(base, remote)
    args = ["pull", remote]
    branch = p.get("branch")
    if branch and branch != "current":
        args.append(branch)
    run_git(base, *args)
    return {"ok": True}


@router.get("/branches")
async def branches(request: Request):
    base = require_base(await get_params(request))
    current = run_git(base, "branch", "--show-current").strip()
    out = run_git(base, "branch", "-a", "--format=%(refname)")
    names = []
    for ref in out.splitlines():
        ref = ref.strip()
        if not ref or ref.endswith("/HEAD"):
            continue
        if ref.startswith("refs/heads/"):
            names.append(ref[len("refs/heads/"):])
        elif ref.startswith("refs/"):
            names.append(ref[len("refs/"):])
    return {"current": current, "branches": names}


@router.post("/checkout")
async def checkout(request: Request):
    p = await get_params(request)
    branch = p.get("branch")
    if not branch:
        raise GitError("branch required")
    args = ["checkout", "-b", branch] if p.get("create") else ["checkout", branch]
    run_git(require_base(p), *args)
    return {"ok": True}


@router.post("/init")
async def init(request: Request):
    run_git(require_base(await get_params(request)), "init")
    return {"ok": True}
