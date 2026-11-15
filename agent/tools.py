"""Outils de l'agent TrappistCode : fichiers, shell, git, TrappistAI.

C'est la couche d'action locale. Elle rend Gemma + DeepSeek/Qwen autonomes
sans avoir besoin de Kimi. Kimi reste un supervisor/renfort externe optionnel.

Principes de sécurité :
- tout chemin est normalisé et restreint à ROOT
- les modifications destructrices sauvegardent automatiquement l'ancien fichier
- les fichiers trop gros sont refusés
- chaque action est journalisée dans .agent/actions.log
- le workspace initial est verrouillé : on ne peut pas en sortir via set_root
"""
import os, json, subprocess, urllib.request, shutil
from datetime import datetime

ROOT = os.path.abspath(os.environ.get("AGENT_ROOT", os.getcwd()))
ROOT_INITIAL = ROOT  # verrou : set_root ne peut pas sortir de ce dossier
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 Mo max pour write_file
SKIP_DIRS = {".git", "node_modules", "__pycache__", "dist", ".agent", ".venv", ".idea", ".vscode"}


def _log_action(tool: str, args: dict, result: str):
    """Journal de chaque action outil."""
    log_dir = os.path.join(ROOT, ".agent")
    os.makedirs(log_dir, exist_ok=True)
    ts = datetime.now().isoformat(timespec="seconds")
    try:
        entry = {"ts": ts, "tool": tool, "args": args, "result": str(result)[:300]}
        with open(os.path.join(log_dir, "actions.log"), "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _inside_initial(p: str) -> bool:
    """Vérifie que le chemin reste dans ROOT_INITIAL."""
    if not ROOT_INITIAL:
        return True
    return p.startswith(ROOT_INITIAL) or p.lower().startswith(ROOT_INITIAL.lower())


def _normalize_path(path: str) -> str:
    """Convertit un chemin absolu qui pointe dans ROOT en chemin relatif.
    Supporte Windows (C:\...) et Unix (/...)."""
    if not path:
        return path
    path = path.strip().replace("\n", "").replace("\r", "")
    if not os.path.isabs(path):
        return path
    abs_root = os.path.abspath(ROOT)
    p = os.path.abspath(path)
    if p.lower().startswith(abs_root.lower()):
        rel = os.path.relpath(p, abs_root)
        return rel
    return path


def _safe(path: str) -> str:
    """Normalise un chemin relatif et vérifie qu'il reste dans ROOT_INITIAL.
    Accepte les chemins absolus si ils sont dans le projet."""
    if not path:
        raise ValueError("Chemin vide")
    path = _normalize_path(path)
    # Supprime les sauts de ligne et caractères dangereux
    path = path.replace("\n", "").replace("\r", "").strip()
    joined = os.path.join(ROOT, path)
    p = os.path.abspath(os.path.realpath(joined))
    if not _inside_initial(p):
        raise ValueError(f"Chemin hors projet: {path}")
    return p


def set_root(path: str) -> str:
    """Change le dossier de travail de l'agent. Crée le dossier s'il n'existe pas.
    Interdit de sortir de ROOT_INITIAL."""
    global ROOT
    path = _normalize_path(path)
    p = os.path.abspath(os.path.join(ROOT_INITIAL, path))
    if not _inside_initial(p):
        raise ValueError(f"set_root interdit hors du workspace initial: {path}")
    os.makedirs(p, exist_ok=True)
    if not os.path.isdir(p):
        raise ValueError(f"Dossier invalide: {path}")
    ROOT = p
    os.chdir(ROOT)
    _log_action("set_root", {"path": path}, "OK")
    return f"Dossier de travail: {ROOT}"


def exists_file(path: str) -> bool:
    """Vérifie qu'un fichier ou dossier existe."""
    return os.path.exists(_safe(path))


def read_file(path: str) -> str:
    """Lit un fichier texte."""
    p = _safe(path)
    if os.path.getsize(p) > MAX_FILE_SIZE:
        # Lire seulement les premières lignes pour les gros fichiers
        with open(p, encoding="utf-8") as f:
            return f"[Fichier volumineux, début]\n" + f.read(500000)
    with open(p, encoding="utf-8") as f:
        content = f.read()
    _log_action("read_file", {"path": path}, "OK")
    return content


def read_binary(path: str) -> bytes:
    """Lit un fichier en binaire."""
    with open(_safe(path), "rb") as f:
        return f.read()


def _backup(p: str):
    """Sauvegarde l'ancien fichier avant modification/destruction."""
    if os.path.exists(p):
        backup_dir = os.path.join(ROOT, ".agent", "backups")
        os.makedirs(backup_dir, exist_ok=True)
        rel = os.path.relpath(p, ROOT).replace("\\", "_").replace("/", "_")
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        dst = os.path.join(backup_dir, f"{rel}.{ts}.bak")
        shutil.copy2(p, dst)


def write_file(path: str, content: str) -> str:
    """Crée ou écrase un fichier texte. Sauvegarde l'ancien si existant."""
    p = _safe(path)
    if len(content.encode("utf-8")) > MAX_FILE_SIZE:
        raise ValueError(f"Fichier trop gros: {len(content)} octets (max {MAX_FILE_SIZE})")
    d = os.path.dirname(p)
    if d:
        os.makedirs(d, exist_ok=True)
    _backup(p)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    result = f"OK {path} ({len(content)} car.)"
    _log_action("write_file", {"path": path}, result)
    return result


def append_file(path: str, content: str) -> str:
    """Ajoute du contenu à la fin d'un fichier existant."""
    p = _safe(path)
    _backup(p)
    d = os.path.dirname(p)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(p, "a", encoding="utf-8") as f:
        f.write(content)
    result = f"OK append {path} (+{len(content)} car.)"
    _log_action("append_file", {"path": path}, result)
    return result


def delete_file(path: str) -> str:
    """Supprime un fichier (avec backup)."""
    p = _safe(path)
    _backup(p)
    os.remove(p)
    result = f"Supprimé: {path}"
    _log_action("delete_file", {"path": path}, result)
    return result


def copy_file(src: str, dst: str) -> str:
    """Copie un fichier."""
    s = _safe(src)
    d = _safe(dst)
    _backup(d)
    os.makedirs(os.path.dirname(d), exist_ok=True)
    shutil.copy2(s, d)
    result = f"Copié {src} -> {dst}"
    _log_action("copy_file", {"src": src, "dst": dst}, result)
    return result


def rename_file(src: str, dst: str) -> str:
    """Renomme/déplace un fichier."""
    return move_file(src, dst)


def move_file(src: str, dst: str) -> str:
    """Déplace un fichier (avec backup de la destination)."""
    s = _safe(src)
    d = _safe(dst)
    _backup(d)
    os.makedirs(os.path.dirname(d), exist_ok=True)
    shutil.move(s, d)
    result = f"Déplacé {src} -> {dst}"
    _log_action("move_file", {"src": src, "dst": dst}, result)
    return result


def list_files() -> str:
    """Liste les fichiers du projet, triés, limités à 400."""
    out = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            out.append(os.path.relpath(os.path.join(dp, f), ROOT))
    return "\n".join(sorted(out)[:400])


def list_tree() -> str:
    """Retourne un arbre textuel du projet, plus lisible pour le LLM."""
    lines = []
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        level = dp.replace(ROOT, "").count(os.sep)
        indent = "  " * level
        lines.append(f"{indent}{os.path.basename(dp)}/")
        subindent = "  " * (level + 1)
        for f in fn:
            lines.append(f"{subindent}{f}")
    return "\n".join(lines[:400])


def get_context(max_files: int = 10) -> str:
    """Construit un résumé enrichi du projet pour le prompt de Gemma.
    Inclut l'arbre et le début des fichiers principaux."""
    tree = list_tree()
    fichiers = list_files().split("\n")[:max_files]
    out = ["=== ARBRE ===", tree, "", "=== FICHIERS ==="]
    for f in fichiers:
        try:
            content = read_file(f)
            out.append(f"--- {f} ---")
            out.append(content[:800])
            out.append("")
        except Exception as e:
            out.append(f"--- {f} --- [erreur: {e}]")
    return "\n".join(out)


def shell(cmd: str, timeout: int = 180) -> str:
    """Exécute une commande shell dans ROOT."""
    try:
        r = subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        result = ((r.stdout or "") + (r.stderr or "")).strip()[:3000] or "(rien)"
        _log_action("shell", {"cmd": cmd}, result[:200])
        return result
    except subprocess.TimeoutExpired:
        return f"TIMEOUT ({timeout}s): {cmd}"


def git(args: str) -> str:
    """Exécute une commande git."""
    return shell("git " + args)


def commit_push(message: str) -> str:
    """Commit + push atomique."""
    git("add -A")
    git("commit -m " + json.dumps(message))
    return git("push")


def trappist_generate(kind: str, prompt: str, out_path: str) -> str:
    """Genere un asset via TrappistAI : kind = image | music | 3d | video."""
    url = os.environ.get("TRAPPIST_API", "http://localhost:9000/generate")
    body = json.dumps({"kind": kind, "prompt": prompt}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        data = resp.read()
    p = _safe(out_path)
    d = os.path.dirname(p)
    if d:
        os.makedirs(d, exist_ok=True)
    _backup(p)
    with open(p, "wb") as f:
        f.write(data)
    result = f"Asset {kind} -> {out_path} ({len(data)} octets)"
    _log_action("trappist_generate", {"kind": kind, "out_path": out_path}, result)
    return result


TOOLS = {
    "read_file": read_file,
    "read_binary": read_binary,
    "write_file": write_file,
    "append_file": append_file,
    "delete_file": delete_file,
    "copy_file": copy_file,
    "rename_file": rename_file,
    "move_file": move_file,
    "exists_file": exists_file,
    "list_files": list_files,
    "list_tree": list_tree,
    "get_context": get_context,
    "shell": shell,
    "git": git,
    "commit_push": commit_push,
    "trappist_generate": trappist_generate,
    "set_root": set_root,
}
