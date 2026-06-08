// URL base do backend lembranca-api. Centralizado pra trocar em 1 lugar
// caso domain mude (ex: prod vs staging).
export const API_URL = 'https://suno-api-novo.bvph.uk'

// Wrapper de GET JSON com timeout + retorno null em erro (nao throw).
// Util pra polling de status onde 1 falha pontual nao deve crashar UI.
export async function apiGet(path, { timeout = 15000 } = {}) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeout)
  try {
    const r = await fetch(`${API_URL}${path}`, { signal: ctrl.signal })
    if (!r.ok) return null
    return await r.json()
  } catch (_) {
    return null
  } finally {
    clearTimeout(t)
  }
}

// Wrapper de POST JSON com retry exponencial em 5xx/rede.
// Aborta cedo em 4xx (erro permanente, retry nao ajuda).
export async function apiPost(path, body, { retries = 3, timeout = 15000 } = {}) {
  let lastErr = null
  for (let attempt = 0; attempt < retries; attempt++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeout)
    try {
      const r = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      clearTimeout(t)
      if (r.ok) return await r.json()
      if (r.status >= 400 && r.status < 500) throw new Error(`${path} ${r.status}`)
      lastErr = new Error(`${path} ${r.status}`)
    } catch (err) {
      clearTimeout(t)
      lastErr = err
      if (err.message && err.message.includes('4')) throw err // 4xx nao retenta
    }
    // backoff exponencial: 250ms · 750ms · 2250ms
    await new Promise(res => setTimeout(res, 250 * Math.pow(3, attempt)))
  }
  throw lastErr || new Error(`${path} failed`)
}
