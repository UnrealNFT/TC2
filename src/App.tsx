  const handleAddWorkspace = async () => {
    try {
      const absPath = await requestDirectory()
      addWorkspace(absPath)
      await localApi.listFiles('')
      setOpenFiles([])
      setActiveFilePath(null)
      setRefreshKey((k) => k + 1)
      showToast(`Dossier ouvert : ${absPath}`)
    } catch (e: any) {
      console.error(e)
      const fallback = window.prompt('Chemin absolu du dossier projet :', 'C:\\Users\\Djaf\\MonProjet')
      if (!fallback) return
      try {
        addWorkspace(fallback.trim())
        await localApi.listFiles('')
        setOpenFiles([])
        setActiveFilePath(null)
        setRefreshKey((k) => k + 1)
        showToast(`Dossier ouvert : ${fallback.trim()}`)
      } catch (e2: any) {
        showToast(`Impossible d'ouvrir : ${e2.message}`)
      }
    }
  }