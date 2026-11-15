def callback(tour: int, action: dict, resultat: str):
    nom = action.get("action", "?")
    cycle = (tour - 1) // 10 + 1 if tour else 0

    # Formate un texte compréhensible pour le chat sans déverser de code entier
    if nom in ("read_file", "read_binary"):
        texte = str(resultat) if resultat else ""
        lignes = texte.splitlines()
        debut = "\n".join(lignes[:4]).strip()
        pensee = f"👁️ Je lis {action.get('args', {}).get('path', 'un fichier')}. ({len(texte)} car., {len(lignes)} lignes)"
        if debut:
            pensee += f"\nDébut :\n{debut[:200]}"
    elif nom == "get_context":
        lignes = str(resultat).splitlines() if resultat else []
        pensee = f"🧠 Contexte projet chargé ({len(lignes)} lignes)."
    elif nom == "list_files":
        fichiers = str(resultat).splitlines() if resultat else []
        pensee = f"📁 Liste des fichiers : {len(fichiers)} fichiers trouvés."
    elif nom == "list_tree":
        lignes = str(resultat).splitlines() if resultat else []
        pensee = f"🌳 Arborescence chargée ({len(lignes)} lignes)."
    elif isinstance(resultat, str) and resultat:
        pensee = resultat
    else:
        pensee = f"Action {nom} exécutée"

    # Cap à 400 caractères pour le chat
    pensee = pensee[:400]
    TOURS.append({"tour": tour, "cycle": cycle, "action": nom, "pensee": pensee})
