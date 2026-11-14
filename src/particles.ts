export function createParticles() {
  // Effet visuel minimal : points verts flottants dans le fond
  const canvas = document.createElement('canvas')
  canvas.id = 'tc-particles'
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '-1'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  resize()
  window.addEventListener('resize', resize)

  const count = 40
  const dots = Array.from({ length: count }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    r: Math.random() * 1.5 + 0.5,
  }))

  function frame() {
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(0, 255, 65, 0.18)'
    for (const d of dots) {
      d.x += d.vx
      d.y += d.vy
      if (d.x < 0) d.x = canvas.width
      if (d.x > canvas.width) d.x = 0
      if (d.y < 0) d.y = canvas.height
      if (d.y > canvas.height) d.y = 0
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
      ctx.fill()
    }
    requestAnimationFrame(frame)
  }
  frame()
}
