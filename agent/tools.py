# pyright: reportMissingImports=false
"""Outils basiques de l'agent TrappistCode."""
import os
import shutil
import subprocess
from pathlib import Path

ROOT = os.getcwd()
ROOT_INITIAL = ROOT


def initialize_root(path: str):
    global ROOT, ROOT_INITIAL
    ROOT = os.path.abspath(path)
    ROOT_INITIAL = ROOT
    os.makedirs(ROOT, exist_ok=True)


def _rel(path: str) -> str:
    if os.path.isabs(path):
        path = os.path.relpath(path, ROOT).replace("\\", "/")
    path = path.lstrip("/")
    return path


def _abs(path: str) -> str:
    return os.path.abspath(os.path.join(ROOT, _rel(path)))


def _safe(path: str) -> str:
    abspath = _abs(path)
    if not abspath.startswith(ROOT):
        raise ValueError(f"chemin interdit: {path}")
    return abspath


# ============== Outils fichiers ==============

def write_file(path: str, content: str) -> str:
    p = _safe(path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    rel = _rel(p)
    return f"OK {rel} ({len(content)} car.)"


def append_file(path: str, content: str) -> str:
    p = _safe(path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "a", encoding="utf-8") as f:
        f.write(content)
    return f"OK append {len(content)} car."


def read_file(path: str) -> str:
    p = _safe(path)
    if not os.path.isfile(p):
        return ""
    with open(p, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def exists_file(path: str) -> bool:
    return os.path.isfile(_safe(path))


def delete_file(path: str) -> str:
    p = _safe(path)
    if os.path.isfile(p):
        os.remove(p)
        return f"OK supprimé {_rel(p)}"
    return "OK (n'existait pas)"


def copy_file(src: str, dst: str) -> str:
    s = _safe(src)
    d = _safe(dst)
    os.makedirs(os.path.dirname(d), exist_ok=True)
    shutil.copy2(s, d)
    return f"OK copie {_rel(s)} -> {_rel(d)}"


def move_file(src: str, dst: str) -> str:
    s = _safe(src)
    d = _safe(dst)
    os.makedirs(os.path.dirname(d), exist_ok=True)
    shutil.move(s, d)
    return f"OK déplacement {_rel(s)} -> {_rel(d)}"


def rename_file(src: str, dst: str) -> str:
    return move_file(src, dst)


def shell(cmd: str) -> str:
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            cwd=ROOT,
        )
        out = (result.stdout or "") + ("\n" if result.stderr else "") + (result.stderr or "")
        return out.strip() or "OK"
    except Exception as e:
        return f"ERREUR: {e}"


def git(args: str) -> str:
    if shutil.which("git") is None:
        return "ERREUR: git non disponible"
    try:
        result = subprocess.run(
            ["git"] + (args.split() if isinstance(args, str) else list(args)),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            cwd=ROOT,
        )
        out = (result.stdout or "") + (result.stderr or "")
        return out.strip() or "OK"
    except Exception as e:
        return f"ERREUR git: {e}"


def commit_push(message: str) -> str:
    git("add -A")
    r = git(f'commit -m "{message}"')
    if "nothing to commit" in r.lower():
        return "Rien à commiter"
    git("push")
    return r.strip() or "OK commit+push"


# ============== Contexte ==============

def list_files(path: str = ".") -> str:
    base = _abs(path)
    if not os.path.isdir(base):
        return "(dossier vide)"
    fichiers = []
    for item in sorted(os.listdir(base)):
        if item.startswith("."):
            continue
        full = os.path.join(base, item)
        if os.path.isfile(full):
            fichiers.append(item)
        else:
            fichiers.append(item + "/")
    return "\n".join(fichiers) or "(dossier vide)"


def list_tree(path: str = ".") -> str:
    base = _abs(path)
    if not os.path.isdir(base):
        return "(dossier vide)"
    lignes = []
    for racine, dirs, files in os.walk(base):
        dirs[:] = [d for d in sorted(dirs) if not d.startswith(".")]
        rel = os.path.relpath(racine, base).replace("\\", "/")
        prefix = "" if rel == "." else rel + "/"
        for f in sorted(files):
            if f.startswith("."):
                continue
            lignes.append(prefix + f)
    return "\n".join(lignes) or "(dossier vide)"


def get_context(max_files: int = 20) -> str:
    tree = list_tree()
    lignes = ["STRUCTURE:", tree]
    fichiers = tree.splitlines()[:max_files]
    for f in fichiers:
        p = _safe(f)
        if os.path.isfile(p):
            lignes.append(f"\n--- {f} ---")
            lignes.append(Path(p).read_text(encoding="utf-8", errors="ignore")[:1200])
    return "\n".join(lignes)


# ============== Outils supportés ==============

TOOLS = {
    "write_file": write_file,
    "append_file": append_file,
    "read_file": read_file,
    "exists_file": exists_file,
    "delete_file": delete_file,
    "copy_file": copy_file,
    "move_file": move_file,
    "rename_file": rename_file,
    "shell": shell,
    "git": git,
    "commit_push": commit_push,
    "list_files": list_files,
    "list_tree": list_tree,
    "get_context": get_context,
    "set_root": initialize_root,
}
