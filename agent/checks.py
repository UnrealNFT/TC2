"""Vérifications gratuites (sans IA) après chaque modification de l'agent.

- HTML : balises non fermées, fermantes orphelines, doublons (<footer>, <body>...)
- JS   : node --check (si Node est installé)
- PY   : compile()
- JSON : json.loads
- CSS  : équilibre des accolades

Utilisé par tools.edit_file / write_file / append_file / test_file.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from html.parser import HTMLParser

# Balises qui ne doivent apparaître qu'une fois par page
UNIQUES = ("html", "head", "body", "title", "main", "header", "footer")

# Balises dont on vérifie l'ouverture / fermeture
SURVEILLES = {
    "html", "head", "body", "div", "section", "main", "header", "footer", "nav",
    "article", "aside", "ul", "ol", "table", "form", "script", "style",
}


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.counts: dict[str, int] = {}
        self.stack: list[tuple[str, int]] = []
        self.errors: list[str] = []

    def handle_starttag(self, tag, attrs):
        self.counts[tag] = self.counts.get(tag, 0) + 1
        if tag in SURVEILLES:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        self.counts[tag] = self.counts.get(tag, 0) + 1

    def handle_endtag(self, tag):
        if tag not in SURVEILLES:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for t, ligne in self.stack[i + 1:]:
                    self.errors.append(f"<{t}> ouvert ligne {ligne} jamais fermé")
                del self.stack[i:]
                return
        self.errors.append(f"</{tag}> ligne {self.getpos()[0]} sans balise ouvrante")


def check_html(content: str) -> list[str]:
    p = _Parser()
    try:
        p.feed(content)
        p.close()
    except Exception as e:
        return [f"HTML illisible : {e}"]
    errs = list(p.errors)
    for t, ligne in p.stack:
        errs.append(f"<{t}> ouvert ligne {ligne} jamais fermé")
    for tag in UNIQUES:
        n = p.counts.get(tag, 0)
        if n > 1:
            errs.append(f"{n} balises <{tag}> dans la page (une seule attendue)")
    return errs


def check_js(content: str) -> list[str]:
    node = shutil.which("node")
    if not node:
        return []  # Node absent : pas de vérification
    fd, tmp = tempfile.mkstemp(suffix=".js")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        proc = subprocess.run([node, "--check", tmp], capture_output=True, text=True, timeout=20)
        if proc.returncode == 0:
            return []
        err = (proc.stderr or proc.stdout or "").strip()
        # Modules ES (import/export) : node --check en mode CommonJS se trompe -> on ignore
        if "import statement" in err or "export" in err.lower():
            return []
        ligne = ""
        m = re.search(r":(\d+)\s*$", err.splitlines()[0]) if err else None
        if m:
            ligne = f" ligne {m.group(1)}"
        msg = next((l for l in err.splitlines() if "Error" in l), err[:200])
        return [f"Syntaxe JS{ligne} : {msg.strip()}"]
    except Exception:
        return []
    finally:
        try:
            os.remove(tmp)
        except Exception:
            pass


def check_python(content: str, path: str = "<fichier>") -> list[str]:
    try:
        compile(content, path, "exec")
        return []
    except SyntaxError as e:
        return [f"Syntaxe Python ligne {e.lineno} : {e.msg}"]


def check_json(content: str) -> list[str]:
    try:
        json.loads(content)
        return []
    except Exception as e:
        return [f"JSON invalide : {e}"]


def check_css(content: str) -> list[str]:
    sans_comment = re.sub(r"/\*.*?\*/", "", content, flags=re.S)
    sans_chaines = re.sub(r"(\"[^\"]*\"|'[^']*')", "", sans_comment)
    ouv, ferm = sans_chaines.count("{"), sans_chaines.count("}")
    if ouv != ferm:
        return [f"CSS : {ouv} accolades ouvrantes pour {ferm} fermantes"]
    return []


def verifier(path: str, content: str) -> list[str]:
    """Renvoie la liste des problèmes détectés (vide = OK)."""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".html", ".htm"):
        return check_html(content)
    if ext in (".js", ".mjs", ".cjs"):
        return check_js(content)
    if ext == ".py":
        return check_python(content, path)
    if ext == ".json":
        return check_json(content)
    if ext == ".css":
        return check_css(content)
    return []


def _cle(err: str) -> str:
    """Normalise un message (sans numéro de ligne) pour comparer avant/après."""
    return re.sub(r"ligne \d+", "ligne ?", err)


def nouvelles_erreurs(path: str, avant: str, apres: str) -> list[str]:
    """Erreurs présentes APRÈS la modification mais pas AVANT.
    Les défauts déjà présents ne bloquent pas l'agent."""
    deja = {_cle(e) for e in verifier(path, avant)} if avant else set()
    return [e for e in verifier(path, apres) if _cle(e) not in deja]
