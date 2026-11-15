def decider(objectif: str, historique: list, contexte: str, guidance: str = "") -> dict:
    """Prochaine action. Salutation simple => done direct."""
    msg = objectif.strip().lower()
    if len(msg) < 12 and any(w in msg for w in ("yo", "salut", "bonjour", "hey", "coucou", "hello")):
        return {"pensee": "Salutation", "action": "done", "args": {"resume": "Yo. Dis-moi ce que tu veux construire."}}

    chemin = re.search(r"[a-z]:\\[^\s\"']+", objectif, re.I)
    if chemin and not historique:
        return {
            "pensee": "Le message donne un dossier. Je l'ouvre avant toute réponse.",
            "action": "set_root",
            "args": {"path": chemin.group(0)},
        }

    if est_discussion(objectif) and not historique:
        return {"pensee": "Discussion", "action": "done", "args": {"resume": discuter(objectif)}}

    hist = "\n".join(f"- {a} => {str(r)[:350]}" for a, r in historique[-8:]) or "(début)"
    lecture = ""
    if any(k in msg for k in ("lis", "lire", "que fait", "répond", "repond")):
        lecture = (
            "\nLis avec list_files puis read_file. Interdit de répondre done avant. "
            "Le resume du done sera ta réponse en français, pas le mot terminé."
        )

    # Détection anti-boucle
    actions_recentes = [a.get("action") for a, _ in historique[-6:]]
    anti_boucle = ""
    if actions_recentes.count("list_files") >= 3 or actions_recentes.count("read_file") >= 3:
        fichiers = []
        for nom in contexte.splitlines()[:25]:
            nom = nom.strip()
            if nom and not nom.endswith("/") and any(nom.lower().endswith(ext) for ext in (".html", ".css", ".js", ".ts", ".tsx", ".py", ".json", ".md")):
                fichiers.append(nom)
        anti_boucle = (
            "\n\n⚠️ TU AS DÉJÀ FAIT TROP DE list_files/read_file D'AFFILÉE. "
            "Tu dois AGIR maintenant : write_file, append_file, delete_file, rename_file, copy_file, shell ou commit_push. "
            f"Fichiers existants ({len(fichiers)}) : {', '.join(fichiers[:10])}. "
            "Si l'objectif est atteint, appelle done."
        )

    prompt = (
        f"OBJECTIF : {objectif}\n\n"
        f"FICHIERS :\n{contexte[:1800] or '(dossier vide)'}\n\n"
        f"HISTORIQUE :\n{hist}\n\n"
    )
    if guidance:
        prompt += f"GUIDANCE : {guidance}\n\n"
    prompt += (
        "EXPORTE un seul JSON avec 'action', 'args', 'pensee'. "
        "Interdit de répondre avec du texte libre, du markdown ou plusieurs blocs. "
        "Si le dossier est vide, écris un premier fichier avec write_file. "
        "Si les fichiers existent déjà, AMÉLIORE-LES (write_file/append_file) au lieu de lister. "
        "N'utilise list_tree/list_files qu'au tout premier tour. Ensuite c'est une perte de temps."
    )
    prompt += lecture + anti_boucle

    try:
        data = _coder(prompt)
    except Exception as e:
        return secours_kimi(prompt) or {"pensee": "fallback erreur", "action": "done", "args": {"resume": f"Erreur LLM: {e}"}}

    vide = not contexte.strip() or contexte.strip() == "(dossier vide)"
    if vide and not historique and data.get("action") != "write_file":
        data = _coder(prompt + "\n\nInterdit de répondre done. Écris le premier fichier maintenant avec write_file.")

    # Si on détecte une action répétitive inutile, forcer write_file ou done
    if data.get("action") in ("list_files", "list_tree") and actions_recentes.count("list_files") >= 2:
        fichiers = []
        for nom in contexte.splitlines()[:25]:
            nom = nom.strip()
            if nom and not nom.endswith("/") and any(nom.lower().endswith(ext) for ext in (".html", ".css", ".js", ".ts", ".tsx", ".py", ".json", ".md")):
                fichiers.append(nom)
        if fichiers:
            return {"pensee": "Forçage d'action concrète après listes répétées.", "action": "read_file", "args": {"path": fichiers[0]}}

    return data
