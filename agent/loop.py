def _normaliser_index_html(html: str, root: str) -> str:
    """Convertit les href/src absolus pointant vers root en chemins relatifs."""
    if not html or not root:
        return html
    root_lower = root.lower()

    def replace_attr(m: re.Match) -> str:
        attr = m.group(1)
        val = m.group(2)
        if val.startswith(("http", "//", "#", "data:")):
            return m.group(0)
        abs_val = os.path.abspath(val)
        if abs_val.lower().startswith(root_lower):
            rel = os.path.relpath(abs_val, root).replace("\\", "/")
            return f'{attr}="{rel}"'
        return m.group(0)

    html = re.sub(r'(href|src)="([^"]+)"', replace_attr, html)
    return re.sub(r"(href|src)='([^']+)'", replace_attr, html)
