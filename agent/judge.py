"""Juge en code + carte du projet + budget Kimi (étape 2a).

Module additif : n'écrase rien. À l'import, il enregistre/corrige des outils
dans tools.TOOLS (set_root, test_project, repo_map, check_criteria).
"""
import os
import re

from . import checks, tools

# ---------------------------------------------------------------- budget Kimi
KIMI_MAX_APPELS = int(os.environ.get("KIMI_MAX_APPELS", "3"))
KIMI_REVUE_TOUR = int(os.environ.get("KIMI_REVUE_TOUR", "10"))


class BudgetKimi:
    """Plan + revue tour N + déblocages partagent KIMI_MAX_APPELS.
    La revue finale est HORS budget : toujours autorisée une fois."""

    def __init__(self, max_appels: int = KIMI_MAX_APPELS):
        self.max = max_appels
        self.utilises = 0
        self.finale_faite = False

    def peut(self, type_appel: str) -> bool:
        if self.max <= 0:
            return False
        if type_appel == "final":
            return not self.finale_faite
        return self.utilises < self.max

    def consommer(self, type_appel: str) -> None:
        if type_appel == "final":
            self.finale_faite = True
        else:
            self.utilises += 1


# ---------------------------------------------------------------- set_root
def set_root(path: str = "", **_) -> str:
    """Nettoie le chemin (virgule, point, guillemets) et renvoie un vrai message."""
    propre = str(path or "").strip().strip("\"'").rstrip(",;.:!? ")
    if not propre:
        return "ERREUR: chemin vide"
    try:
        tools.initialize_root(propre)
    except Exception as e:
        return f"ERREUR set_root: {e}"
    return f"Dossier de travail : {tools.ROOT}"


# ---------------------------------------------------------------- carte projet
_EXTS = (".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx", ".py", ".json", ".md")
_IGNORE = {"node_modules", ".git", "dist", "build", "__pycache__", ".venv"}


def _symboles(rel: str, txt: str) -> str:
    ext = os.path.splitext(rel)[1].lower()
    out = []
    if ext in (".html", ".htm"):
        tags = re.findall(r"<(header|nav|main|section|article|footer|aside|form|canvas)\b([^>]*)>", txt, re.I)
        for tag, attrs in tags[:25]:
            m = re.search(r'id\s*=\s*["\']?([\w-]+)', attrs)
            out.append(tag.lower() + (f"#{m.group(1)}" if m else ""))
    elif ext == ".css":
        out = re.findall(r"^\s*([^{}@/\n][^{}\n]{0,40})\{", txt, re.M)[:20]
        out = [s.strip() for s in out]
    elif ext in (".js", ".ts", ".tsx", ".jsx"):
        out = re.findall(r"(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:\(|async|function))", txt)
        out = [a or b for a, b in out][:20]
    elif ext == ".py":
        out = re.findall(r"^(?:def|class)\s+(\w+)", txt, re.M)[:25]
    return ", ".join(out)


def repo_map(max_files: int = 40, **_) -> str:
    """Carte courte : fichier (lignes) : symboles. Pour Kimi, pas tout le code."""
    lignes = []
    for root, dirs, files in os.walk(tools.ROOT):
        dirs[:] = [d for d in dirs if d not in _IGNORE]
        for f in sorted(files):
            if not f.lower().endswith(_EXTS) or ".agent.bak" in f:
                continue
            full = os.path.join(root, f)
            rel = os.path.relpath(full, tools.ROOT).replace("\\", "/")
            try:
                txt = open(full, encoding="utf-8").read()
            except Exception:
                continue
            lignes.append(f"{rel} ({txt.count(chr(10)) + 1} l.) : {_symboles(rel, txt)}")
            if len(lignes) >= max_files:
                return "\n".join(lignes)
    return "\n".join(lignes) or "(dossier vide)"


# ---------------------------------------------------------------- juge
def _lire(path: str) -> str:
    try:
        return open(tools._path(path), encoding="utf-8").read()
    except Exception:
        return ""


def _un_critere(c: dict) -> tuple[bool, str]:
    """Types : contains, not_contains, count (n exact), count_min (n mini), before (a avant b)."""
    t = str(c.get("type", "contains"))
    f = str(c.get("file", "index.html"))
    v = str(c.get("value", ""))
    txt = _lire(f)
    if not txt:
        return False, f"{f} introuvable ou vide"
    low, vl = txt.lower(), v.lower()
    if t == "contains":
        return vl in low, f"{f} contient {v}"
    if t == "not_contains":
        return vl not in low, f"{f} ne contient pas {v}"
    if t == "count":
        n = int(c.get("n", 1))
        k = low.count(vl)
        return k == n, f"{f} : {v} x{n} (trouvé {k})"
    if t == "count_min":
        n = int(c.get("n", 1))
        k = low.count(vl)
        return k >= n, f"{f} : {v} au moins x{n} (trouvé {k})"
    if t == "before":
        a, b = vl, str(c.get("before", "")).lower()
        ia, ib = low.find(a), low.find(b)
        return (ia != -1 and ib != -1 and ia < ib), f"{f} : {v} avant {c.get('before')}"
    return False, f"type de critère inconnu : {t}"


def check_criteria(criteres: list | None = None, **_) -> dict:
    """Juge : renvoie {ok, passes, echecs}. Ajoute toujours les checks de structure."""
    criteres = criteres or []
    passes, echecs = [], []
    for c in criteres:
        try:
            ok, label = _un_critere(c if isinstance(c, dict) else {"value": str(c)})
        except Exception as e:
            ok, label = False, f"critère invalide {c}: {e}"
        (passes if ok else echecs).append(label)
    fichiers = {str(c.get("file", "index.html")) for c in criteres if isinstance(c, dict)}
    for f in sorted(fichiers):
        txt = _lire(f)
        if txt:
            for e in checks.verifier(f, txt)[:5]:
                echecs.append(f"structure {f} : {e}")
    return {"ok": not echecs, "passes": passes, "echecs": echecs}


def format_verdict(v: dict) -> str:
    l = [f"✅ {p}" for p in v["passes"]] + [f"❌ {e}" for e in v["echecs"]]
    return ("JUGE OK\n" if v["ok"] else "JUGE REFUSE\n") + "\n".join(l)


# ---------------------------------------------------------------- test web
def test_project(cmd: str = "", **_) -> str:
    """Comme tools.test_project, mais teste aussi les fichiers web statiques."""
    r = tools.test_project(cmd)
    if r != "AUCUN TEST TROUVÉ":
        return r
    resultats = []
    for root, dirs, files in os.walk(tools.ROOT):
        dirs[:] = [d for d in dirs if d not in _IGNORE]
        for f in files:
            if f.lower().endswith((".html", ".htm", ".css", ".js", ".json", ".py")) and ".agent.bak" not in f:
                rel = os.path.relpath(os.path.join(root, f), tools.ROOT).replace("\\", "/")
                resultats.append(tools.test_file(rel))
    if not resultats:
        return "AUCUN TEST TROUVÉ"
    erreurs = [r for r in resultats if r.startswith("ERREUR")]
    return ("ERREUR TESTS\n" + "\n".join(erreurs)) if erreurs else "OK: " + ", ".join(
        r.replace("OK: ", "").replace(" vérifié", "") for r in resultats)


# ---------------------------------------------------------------- enregistrement
tools.TOOLS["set_root"] = set_root
tools.TOOLS["test_project"] = test_project
tools.TOOLS["repo_map"] = repo_map
tools.TOOLS["check_criteria"] = check_criteria
