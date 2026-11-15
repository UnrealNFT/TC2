        if nom == "write_file" and str(resultat).startswith("OK"):
            chemin = _chemin(action)
            try:
                contenu = tools.read_file((action.get("args") or {}).get("path", ""))
            except Exception:
                contenu = (action.get("args") or {}).get("content", "")
            # Normalise index.html : liens absolus -> relatifs
            if chemin.endswith("index.html") or (action.get("args") or {}).get("path", "").lower().endswith("index.html"):
                try:
                    contenu_normalise = _normaliser_index_html(contenu, tools.ROOT_INITIAL or tools.ROOT)
                    if contenu_normalise != contenu:
                        tools.write_file((action.get("args") or {}).get("path", "index.html"), contenu_normalise)
                        contenu = contenu_normalise
                except Exception as e:
                    print(f"[normalisation index.html] {e}")
            avis = brain.controler(objectif, chemin, contenu)
            critique = f"deepseek ok={avis.get('ok')} — {avis.get('raison')} — suite: {avis.get('suite')}"
            if avis.get("ok") or essais.get(chemin, 0) >= 1:
                verrou.add(chemin)
            else:
                essais[chemin] = 1
            suivant = str(avis.get("suite") or "done").strip().lower().split()[0].strip(".,;:")
            if suivant not in ("", "done", "terminé", "termine", chemin):
                suite = suivant
            elif suite == chemin:
                suite = ""
            if callback:
                callback(tour, {"action": "deepseek", "args": {"path": chemin}}, critique)
            _log({"tour": tour, "deepseek": avis, "chemin": chemin})
            done_refuses = 0
