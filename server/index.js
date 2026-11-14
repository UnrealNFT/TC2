import express from 'express'
import cors from 'cors'
import filesRouter from './routes/files.js'
import gitRouter from './routes/git.js'
import previewRouter from './routes/preview.js'

const app = express()
const PORT = process.env.PORT || 4269

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.use('/api/files', filesRouter)
app.use('/api/git', gitRouter)
app.use('/api/preview', previewRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', name: 'trappistcode-server' })
})

app.listen(PORT, () => {
  console.log(`[TrappistCode] Backend running on http://localhost:${PORT}`)
})
