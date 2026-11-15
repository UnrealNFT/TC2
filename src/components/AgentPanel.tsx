  const startPoll = () => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get<AgentStatus>(STATUS_URL, { timeout: 5000 })
        const last = data.tours && data.tours.length > 0 ? data.tours[data.tours.length - 1] : null
        const cycle = last?.cycle ?? 1
        const tour = last?.tour ?? data.tours?.length ?? 0
        setTourCount(tour)
        setRunning(data.running)
        if (last) {
          const line = last.pensee || last.action || '...'
          updateLast('system', { text: `Cycle ${cycle} — Tour ${tour} : ${line}`, meta: { status: data.running ? 'running' : 'done' } })
        }
        if (!data.running) {
          stopPoll()
          setLoading(false)
        }
      } catch { /* ignore */ }
    }, 1000)
  }
