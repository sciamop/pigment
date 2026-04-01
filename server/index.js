import express from 'express'
import fetch from 'node-fetch'

const app = express()
const PORT = 3035

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

app.get('/api/proxy', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'url param required' })

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs allowed' })
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Pigment/1.0)' }
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' })
    }

    const contentType = response.headers.get('content-type') || ''
    const baseType = contentType.split(';')[0].trim()

    if (!ALLOWED_TYPES.includes(baseType)) {
      return res.status(400).json({ error: `Unsupported content type: ${baseType}` })
    }

    res.setHeader('Content-Type', baseType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    response.body.pipe(res)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => console.log(`Pigment proxy server → http://localhost:${PORT}`))
