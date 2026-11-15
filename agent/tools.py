"""Outils basiques pour l'agent : fichiers, shell, git, contexte."""
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Callable

ROOT = os.getcwd()

# Dossiers critiques protégés : source du programme + dossiers système Windows.
PROTECTED_PATHS: list[str] = []


def _load_protected_paths():
    """Charge les chemins critiques à protéger automatiquement."""
    home = Path.home()
    candidates = [
        # Code source de l'agent (localisations courantes)
        str(home / "TC2-git"),
        str(home / "TC2-master"),
        str(Path(__file__).resolve().parent.parent),
        # Dossiers système Windows
        r"C:\Windows",
        r"C:\Program Files",
        r"C:\Program Files (x86)",
        r"C:\ProgramData",
        str(home / "AppData"),
    ]
    for p in candidates:
        try:
            resolved = os.path.normcase(os.path.abspath(p))
            if resolved not in (".", "/", "\\") and os.path.exists(resolved):
                PROTECTED_PATHS.append(resolved)
        except Exception:
            pass


_load_protected_paths()


def _is_critical_path(path: str) -> bool:
    """Vérifie si le chemin est un dossier protégé OU à l'intérieur d'un dossier protégé."""
    try:
        normalized = os.path.normcase(os.path.abspath(path))
        for protected in PROTECTED_PATHS:
            # Rejet direct si égal
            if normalized == protected:
                return True
            # Rejet si le chemin est DANS un dossier protégé
            if normalized.startswith(protected + os.sep):
                return True
        # Rejet des racines de disques seules (ex: C:\)
        if re.fullmatch(r"[a-z]:\\?", normalized):
            return True
        return False
    except Exception:
        return True


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

    if _is_critical_path(full):
        raise PermissionError(
            f"Chemin interdit : {relative} correspond à un dossier protégé."
        )
    return full


def _backup_path(full: str) -> str:
    """Chemin de backup local avant modification."""
    base = full + ".agent.bak"
    i = 1
    candidate = base
    while os.path.exists(candidate):
        candidate = f"{full}.agent.bak.{i}"
        i += 1
    return candidate


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

    # Backup avant écrasement, si le fichier existe et n'est pas vide
    if os.path.isfile(full):
        try:
            existing_size = os.path.getsize(full)
            if existing_size > 0:
                shutil.copy2(full, _backup_path(full))
        except Exception:
            pass

    # Protection contre écriture vide ou très courte sur fichier existant non vide
    if os.path.isfile(full) and len(content.strip()) < 10:
        existing = read_file(path)
        if len(existing.strip()) > 50:
            return f"ERREUR: refus d'écraser {path} avec un contenu quasi vide ({len(content)} caractères). Utilise edit_file."

    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return f"ÉCRIT: {path}"


def edit_file(path: str, old_string: str, new_string: str) -> str:
    """Remplace la première occurrence de old_string par new_string dans un fichier."""
    full = _path(path)
    if not os.path.isfile(full):
        return f"ERREUR: {path} n'existe pas, utilise write_file"

    try:
        with open(full, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        return f"ERREUR LECTURE {path}: {e}"

    if old_string not in content:
        return f"ERREUR: old_string introuvable dans {path}"

    # Backup
    try:
        shutil.copy2(full, _backup_path(full))
    except Exception:
        pass

    new_content = content.replace(old_string, new_string, 1)
    with open(full, "w", encoding="utf-8") as f:
        f.write(new_content)
    return f"ÉDITÉ: {path}"


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
    shutil.move(_path(src), _path(dst))
    return f"RENOMMÉ: {src} -> {dst}"


def move_file(src: str, dst: str) -> str:
    return rename_file(src, dst)


def mkdir(path: str) -> str:
    os.makedirs(_path(path), exist_ok=True)
    return f"CRÉÉ: {path}"


def copy_file(src: str, dst: str) -> str:
    shutil.copy2(_path(src), _path(dst))
    return f"COPIÉ: {src} -> {dst}"


def delete(path: str) -> str:
    full = _path(path)
    if os.path.isfile(full):
        os.remove(full)
    elif os.path.isdir(full):
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
            if f.lower().endswith(
                (".html", ".css", ".js", ".ts", ".tsx", ".py", ".json", ".md")
            ):
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


def test_project(cmd: str = "") -> str:
    """Lance un test réel sur le projet ou un fichier.
    Si cmd est fourni, l'exécute directement. Sinon déduit le test par défaut.
    """
    if cmd:
        return shell(cmd)
    if exists_file("package.json"):
        # Vite / React
        pkg = read_file("package.json")
        if '"build"' in pkg:
            return shell("npm run build")
    if exists_file("requirements.txt"):
        return shell("python -m py_compile *.py")
    return "AUCUN TEST TROUVÉ"


def test_file(path: str) -> str:
    """Teste un fichier individuel selon son extension."""
    full = _path(path)
    ext = Path(full).suffix.lower()
    if ext == ".py":
        return shell(f'python -m py_compile "{full}"')
    if ext in (".js", ".jsx", ".ts", ".tsx"):
        return shell(f'node --check "{full}"')
    if ext == ".html":
        contenu = read_file(path)
        if not contenu.strip().startswith("<"):
            return "ERREUR: le fichier HTML ne commence pas par une balise"
        return "OK (structure HTML basique vérifiée)"
    if ext == ".css":
        return "OK (CSS non exécutable)"
    return f"AUCUN TEST POUR {path}"


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
    "edit_file": edit_file,
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
    "test_project": test_project,
    "test_file": test_file,
    "git_status": git_status,
    "git": _git,
    "commit_push": commit_push,
}
