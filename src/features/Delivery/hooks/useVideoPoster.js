// Extrai o primeiro frame do video como JPEG via canvas pra usar como
// poster do <video>. Resolve a tela cinza/creme do iOS Safari quando
// preload=metadata. Se CORS bloquear toDataURL, retorna null silenciosamente
// (player segue mostrando o botao de play padrao).
import { useEffect, useState } from 'react'

export function useVideoPoster(videoUrl) {
  const [poster, setPoster] = useState(null)

  useEffect(() => {
    if (!videoUrl) return
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'

    let cancelled = false
    const cleanup = () => { try { v.src = ''; v.load() } catch (_) {} }

    v.onloadeddata = () => {
      if (cancelled) return
      // Pula pra 0.5s pra evitar tela preta do fade-in inicial
      try { v.currentTime = Math.min(0.5, (v.duration || 1) * 0.05) } catch (_) {}
    }
    v.onseeked = () => {
      if (cancelled) return cleanup()
      try {
        const canvas = document.createElement('canvas')
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        canvas.getContext('2d').drawImage(v, 0, 0, v.videoWidth, v.videoHeight)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        if (!cancelled) setPoster(dataUrl)
      } catch (_) { /* CORS — silencioso */ }
      cleanup()
    }
    v.onerror = cleanup
    v.src = videoUrl

    return () => { cancelled = true; cleanup() }
  }, [videoUrl])

  return poster
}
