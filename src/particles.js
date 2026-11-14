// Petit système de particules vertes optionnel pour le fond TrappistAI
export function createParticles(container = document.body, count = 60, opacity = 0.08) {
  if (!(container instanceof HTMLElement)) return { stop: () => {} }

  const canvas = document.createElement('canvas')
  canvas.id = 'tc-particles'
  canvas.style.position = 'fixed'
  canvas.style.inset = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.zIndex = '0'
  canvas.style.pointerEvents = 'none'
  canvas.style.opacity = String(opacity)
  container.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) return { stop: () => {} }

  let width = window.innerWidth
  let height = window.innerHeight
  canvas.width = width
  canvas.height = height

  const particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    size: Math.random() * 2 + 1,
  }))

  let rafId = 0
  function animate() {
    ctx.clearRect(0, 0, width, height)

    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy

      if (p.x < 0) p.x = width
      if (p.x > width) p.x = 0
      if (p.y < 0) p.y = height
      if (p.y > height) p.y = 0

      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fillStyle = '#00ff41'
      ctx.fill()
    }

    rafId = requestAnimationFrame(animate)
  }

  animate()

  const onResize = () => {
    width = window.innerWidth
    height = window.innerHeight
    canvas.width = width
    canvas.height = height
  }
  window.addEventListener('resize', onResize)

  return {
    stop: () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', onResize)
      canvas.remove()
    },
  }
}
