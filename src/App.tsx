  const exportZip = async () => {
    if (!activePath) return showToast('Aucun workspace actif')
    try {
      const blob = await localApi.exportZip()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${activePath.split(/[/\\]/).pop() || 'trappist-export'}.zip`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export ZIP téléchargé')
    } catch (e: any) {
      showToast(`Erreur export : ${e.message}`)
    }
  }

  const importZip = async () => {
    if (!activePath) return showToast('Aucun workspace actif')
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        await localApi.importZip(file)
        setRefreshKey((k) => k + 1)
        showToast('Workspace importé')
      } catch (err: any) {
        showToast(`Erreur import : ${err.message}`)
      }
    }
    input.click()
  }
