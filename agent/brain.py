

def repondre_conversation(messages: list, question: str, contexte: str = "") -> str:
    """Répond à une question avec un historique conversationnel.
    messages : liste de {'role': 'user'|'assistant', 'content': str}
    """
    conv = messages.copy()
    if contexte:
        conv.append({"role": "user", "content": f"[Contexte projet]\n{contexte[:2500]}\n/no_think"})
    conv.append({"role": "user", "content": question})
    r = _chat(
        [
            {"role": "system", "content": SYSTEM_CHAT},
            *conv[-12:],
        ],
        num_predict=900,
        temperature=0.35,
    )
    texte = _texte(r)
    if "Persona:" in texte or "Draft" in texte or "Selected response" in texte:
        parts = [p.strip() for p in re.split(r"\n\s*\n", texte) if p.strip()]
        texte = parts[-1] if parts else texte
        texte = re.sub(r"(?is)^(\*+\s*)?(selected response|réponse)\s*:\s*", "", texte).strip()
    return texte[:1500] or "Je suis là."
