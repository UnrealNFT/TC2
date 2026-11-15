  const startPoll = () => {
    stopPoll()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get<AgentStatus>(STATUS_URL, { timeout: 5000 })
        const last = data.tours && data.tours.length > 0 ? data.tours[data.tours.length - 1] : null
        const realTour = last?.tour ?? data.tours?.length ?? 0
        setTourCount(realTour)
        setRunning(data.running)
        if (last) {
          const line = last.pensee || last.action || '...'
          updateLast('system', { text: `Tour ${realTour}: ${line}`, meta: { status: data.running ? 'running' : 'done' } })
        }
        if (!data.running) {
          stopPoll()
          setLoading(false)
        }
      } catch { /* ignore */ }
    }, 1000)
  }
