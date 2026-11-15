      let summary = data.resume || 'Mission terminée.'
      if (data.tours && data.tours.length > 0) {
        const last = data.tours[data.tours.length - 1]
        const realTour = last.tour ?? data.tours.length
        summary = `Tour ${realTour} — ${last.action || 'terminé'}\n${last.pensee || ''}`
      }
