import axios from 'axios'

export async function searchWeb(q: string) {
  const res = await axios.get(`http://localhost:4269/api/search/web?q=${encodeURIComponent(q)}`, {
    timeout: 20000,
  })
  return res.data as { query: string; snippet: string }
}

export async function searchGitHub(q: string) {
  const res = await axios.get(`http://localhost:4269/api/search/github?q=${encodeURIComponent(q)}`, {
    timeout: 20000,
  })
  return res.data as {
    query: string
    repos: Array<{ name: string; url: string; description: string | null; stars: number }>
  }
}
