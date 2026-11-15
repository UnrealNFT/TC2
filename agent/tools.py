"""Outils basiques pour l'agent : fichiers, shell, git, contexte."""
import os
import re
import subprocess
from pathlib import Path
from typing import Callable

ROOT = os.getcwd()

# Dossiers critiques exacts protégés. L'agent ne peut jamais les utiliser comme workspace.
PROTECTED_PATHS: list[str] = []


def _load_protected_paths():
    """Charge les chemins critiques à protéger automatiquement."""
    home = Path.home()
    candidates = [
        os.getcwd(),
        str(home / "TC2-git"),
        str(home / "TC2-master"),
        str(home / "Documents"),
        str(home / "Desktop"),
        str(home / "Downloads"),
    ]
    for p in candidates:
        try:
            PROTECTED_PATHS.append(os.path.normcase(os.path.abspath(p)))
        except Exception:
            pass


_load_protected_paths()


def _is_critical_path(path: str) -> bool:
    """Vérifie si le chemin correspond exactement à un dossier protégé."""
    normalized = os.path.normcase(os.path.abspath(path))
    for protected in PROTECTED_PATHS:
        if normalized == protected:
            return True
    return False


def initialize_root(path: str):
    """Définit le workspace sur lequel l'agent travaille."""
    global ROOT
    if _is_critical_path(path):
        raise PermissionError(
            f"Workspace interdit : {path} est un dossier protégé. "
            "Crée un sous-dossier dédié, ex: C:\\Users\\Djaf\\MonProjet."
        )
    ROOT = os.path.abspath(path)
    os.makedirs(ROOT, exist_ok=True)


def _path(relative: str) -> str:
    if os.path.isabs(relative):
        full = os.path.abspath(relative)
    else:
        full = os.path.normpath(os.path.join(ROOT, relative))

    # Empêche de sortir du workspace vers un dossier critique exact
    if _is_critical_path(full):
        raise PermissionError(
            f"Chemin interdit : {relative} correspond à un dossier protégé."
        )
    return full


def exists_file(path: str) -> bool:
    return os.path.isfile(_path(path))


def read_file(path: str) -> str:
    full = _path(path)
    try:
        with open(full, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        return f"ERREUR LECTURE {path}: {e}"


def write_file(path: str, content: str) -> str:
    full = _path(path)
    os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
    if not isinstance(content, str):
        content = str(content)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return f"ÉCRIT: {path}"


def append_file(path: str, content: str) -> str:
    full = _path(path)
    os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
    with open(full, "a", encoding="utf-8") as f:
        f.write(content)
    return f"AJOUTÉ: {path}"


def delete_file(path: str) -> str:
    full = _path(path)
    if os.path.isfile(full):
        os.remove(full)
        return f"SUPPRIMÉ: {path}"
    return f"INEXISTANT: {path}"


def rename_file(src: str, dst: str) -> str:
    import shutil
    shutil.move(_path(src), _path(dst))
    return f"RENOMMÉ: {src} -> {dst}"


def move_file(src: str, dst: str) -> str:
    return rename_file(src, dst)


def mkdir(path: str) -> str:
    os.makedirs(_path(path), exist_ok=True)
    return f"CRÉÉ: {path}"


def copy_file(src: str, dst: str) -> str:
    import shutil
    shutil.copy2(_path(src), _path(dst))
    return f"COPIÉ: {src} -> {dst}"


def delete(path: str) -> str:
    full = _path(path)
    if os.path.isfile(full):
        os.remove(full)
    elif os.path.isdir(full):
        import shutil
        shutil.rmtree(full)
    return f"SUPPRIMÉ: {path}"


def list_files(path: str = "") -> str:
    full = _path(path)
    if not os.path.isdir(full):
        return f"ERREUR: dossier introuvable {path}"
    try:
        files = sorted(os.listdir(full))
        return "\n".join(files) or "(dossier vide)"
    except Exception as e:
        return f"ERREUR: {e}"


def list_tree(path: str = "") -> str:
    full = _path(path)
    lines = []
    if os.path.isdir(full):
        for root, dirs, files in os.walk(full):
            level = root.replace(full, "").count(os.sep)
            indent = "  " * level
            lines.append(f"{indent}{os.path.basename(root)}/")
            for f in files:
                lines.append(f"{indent}  {f}")
    return "\n".join(lines) or "(vide)"


def get_context(max_files: int = 30) -> str:
    """Récupère le contenu des fichiers sources pour donner du contexte au LLM."""
    files = []
    for root, _, filenames in os.walk(ROOT):
        for f in filenames:
            if f.lower().endswith((".html", ".css", ".js", ".ts", ".tsx", ".py", ".json", ".md")):
                files.append(os.path.join(root, f))
    files.sort(key=lambda x: os.path.getsize(x))
    context = []
    for full in files[:max_files]:
        rel = os.path.relpath(full, ROOT).replace("\\", "/")
        try:
            with open(full, "r", encoding="utf-8") as f:
                content = f.read()
            context.append(f"--- {rel} ---\n{content[:2000]}")
        except Exception:
            pass
    return "\n\n".join(context)


def shell(command: str = "", cmd: str = "", timeout: int = 60) -> str:
    """Exécute une commande shell. Accepte 'command' ou 'cmd'."""
    actual = command or cmd
    if not actual:
        return "ERREUR: pas de commande"
    try:
        proc = subprocess.run(
            actual,
            shell=True,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        out = proc.stdout.strip()
        err = proc.stderr.strip()
        if proc.returncode != 0:
            return f"ERREUR ({proc.returncode}): {err or out}"
        return out or "OK"
    except subprocess.TimeoutExpired:
        return f"ERREUR: timeout après {timeout}s"
    except Exception as e:
        return f"ERREUR: {e}"


def git_status() -> str:
    return shell("git status --short")


def _git(args: str) -> str:
    return shell(f"git {args}")


def commit_push(message: str) -> str:
    status = shell("git status --short")
    if not status.strip():
        return "RIEN À COMMITTER"
    shell("git add .")
    result = shell(f'git commit -m "{message}"')
    shell("git push")
    return result


# Dictionnaire utilisé par agent.loop._executer_action
TOOLS: dict[str, Callable] = {
    "set_root": initialize_root,
    "write_file": write_file,
    "read_file": read_file,
    "append_file": append_file,
    "delete_file": delete_file,
    "delete": delete,
    "copy_file": copy_file,
    "rename_file": rename_file,
    "move_file": move_file,
    "exists_file": exists_file,
    "mkdir": mkdir,
    "list_files": list_files,
    "list_tree": list_tree,
    "get_context": get_context,
    "shell": shell,
    "git_status": git_status,
    "git": _git,
    "commit_push": commit_push,
}
