  const cancelRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const lastSeenPensee = useRef<string>('')
