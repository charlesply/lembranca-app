// Typewriter — texto do hero que digita/apaga frases ciclando.
// Props:
//   - phrases: array de { text, emoji? } pra ciclar (default: HERO_TYPED_PHRASES)
//   - prefix: texto fixo antes (default: 'Uma música ')
import { useEffect, useState } from 'react'

// Frases default do hero da landing.
export const HERO_TYPED_PHRASES = [
  { text: 'para comemorar um aniversário' },
  { text: 'para seu filho campeão' },
  { text: 'para sua mãe querida' },
  { text: 'para homenagear alguém especial' },
  { text: 'para seu melhor amigo' },
  { text: 'para alguém inesquecível' },
]

export default function Typewriter({ phrases = HERO_TYPED_PHRASES, prefix = 'Uma música ' }) {
  const [phIdx, setPhIdx] = useState(0)
  const [shown, setShown] = useState('')
  const [phase, setPhase] = useState('typing')  // 'typing' | 'pause' | 'deleting'

  useEffect(() => {
    const cur = phrases[phIdx % phrases.length].text
    const timeoutMs = 60      // velocidade de digitação por char
    if (phase === 'typing') {
      if (shown.length < cur.length) {
        const t = setTimeout(() => setShown(cur.slice(0, shown.length + 1)), timeoutMs)
        return () => clearTimeout(t)
      } else {
        const t = setTimeout(() => setPhase('deleting'), 1800)   // pausa lendo a frase
        return () => clearTimeout(t)
      }
    }
    if (phase === 'deleting') {
      if (shown.length > 0) {
        const t = setTimeout(() => setShown(cur.slice(0, shown.length - 1)), 30)
        return () => clearTimeout(t)
      } else {
        // próxima frase
        setPhase('typing')
        setPhIdx(i => (i + 1) % phrases.length)
      }
    }
  }, [shown, phase, phIdx, phrases])

  const cur = phrases[phIdx % phrases.length]
  // mostra o emoji só quando a frase está completamente digitada (efeito "chegou")
  const showEmoji = phase !== 'deleting' && shown.length === cur.text.length

  return (
    <p className="hero-typewriter" aria-live="polite" aria-atomic="true">
      <span className="hero-typewriter-prefix">{prefix}</span>
      <span className="hero-typewriter-text">{shown}</span>
      <span className="hero-typewriter-cursor" aria-hidden="true">|</span>
      <span className={`hero-typewriter-emoji${showEmoji ? ' is-shown' : ''}`} aria-hidden="true">{cur.emoji}</span>
    </p>
  )
}
