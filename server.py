def callback(tour: int, action: dict, resultat: str):
    nom = action.get("action", "?")
    cycle = (tour - 1) // 10 + 1 if tour else 0
    # Formate un texte compréhensible pour le chat
    if isinstance(resultat, str) and resultat:
        pensee = resultat
    else:
        pensee = f"Action {nom} exécutée"
    TOURS.append({"tour": tour, "cycle": cycle, "action": nom, "pensee": pensee[:400]})
