      const { data } = await axios.post<{ resume: string; status: string; tours: Tour[] }>(
        RUN_URL,
        { objectif: fullMission, workspace: workspace || '', max_tours: 20 },
        { timeout: 600_000 }
      )
