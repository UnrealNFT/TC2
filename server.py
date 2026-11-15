def _set_workspace(path: str = ""):
    """Initialise le dossier de travail de l'agent en se basant sur le workspace demandé."""
    target = path or os.environ.get("TRAPPIST_WORKSPACE", os.getcwd())
    target = os.path.abspath(target)
    os.makedirs(target, exist_ok=True)
    os.environ["AGENT_ROOT"] = target
    os.environ["TRAPPIST_WORKSPACE"] = target
    tools.initialize_root(target)
