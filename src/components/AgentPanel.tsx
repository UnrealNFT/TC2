      let summary = data.resume || 'Mission terminée.'
      if (data.tours && data.tours.length > 0) {
        const last = data.tours[data.tours.length - 1]
        const cycle = last.cycle ?? 1
        const tour = last.tour ?? data.tours.length
        summary = `Cycle ${cycle} — Tour ${tour} — ${last.action || 'terminé'}\n${last.pensee || ''}`
      }
