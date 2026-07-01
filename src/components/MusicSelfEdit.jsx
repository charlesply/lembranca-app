// Self-edit da música/prévia pelo cliente (1×), reusável.
// Usado no App.jsx (Minhas Músicas + DeliveryPage) e no PaymentPage (/finalizar).
// Regras (fonte de verdade = backend): 3 gerações de letra, 1 nova música/prévia.
// CSS `.mse-*` mora em index.css (global).
import { useState, useEffect } from 'react'
import { API_URL } from '../core/infra'

export const MSE_ENABLED = true
const MSE_MAX_GENS = 3
// Primeiros 8 aparecem de cara; o resto fica atrás do "Ver mais".
const MSE_RITMOS = [
  'Sertanejo', 'Sertanejo universitário', 'MPB', 'Pop romântico', 'Pagode', 'Gospel', 'Forró', 'Voz e violão',
  'Samba', 'Rock', 'Rap / Hip-hop', 'Funk', 'Piano e voz', 'Bossa Nova', 'Axé', 'Country', 'Reggae', 'Infantil', 'Modão', 'Pop',
]
const MSE_RITMOS_CORE = 8
const MSE_OCASIOES = ['Aniversário', 'Casamento', 'Bodas', 'Dia das Mães', 'Dia dos Pais', 'Homenagem', 'Declaração de amor', 'Amizade', 'Formatura', 'Saudade', 'Outra']
const MSE_VOZES = ['Feminina', 'Masculina']
const MSE_SAMPLE = 'Aqui vai aparecer a letra da sua música\npra você ajustar do jeitinho que quiser…'
// voice_preference ("Masculino"/"Feminino") → rótulo da pill ("Masculina"/"Feminina")
const mseVoiceLabel = (v) => { const s = String(v || '').toLowerCase(); return s.startsWith('masc') ? 'Masculina' : s.startsWith('fem') ? 'Feminina' : '' }

export function MusicSelfEdit({ order, onClose, onConfirmed }) {
  // passo: 'menu' | 'data' | 'lyrics' | 'confirm' | 'sending'
  const [step, setStep] = useState('menu')
  const [lyrics, setLyrics] = useState(order.final_lyrics || '')
  const [genLeft, setGenLeft] = useState(Math.max(0, MSE_MAX_GENS - (Number(order.lyric_regen_count) || 0)))
  const [busy, setBusy] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [lyricNote, setLyricNote] = useState('')   // aviso ACIMA da textarea (nunca dentro da letra → não vai pro Suno)
  const [err, setErr] = useState('')
  const [showMoreRitmos, setShowMoreRitmos] = useState(false)
  const [form, setForm] = useState({
    honoree_name: order.honoree_name || '',
    story: order.story || '',
    genre: order.genre || order.style_raw || '',
    occasion: order.occasion || '',
    voice: mseVoiceLabel(order.voice_preference),
  })

  // A letra + os dados do pedido (história, ritmo, ocasião, voz) não vêm no
  // lookup — busca no /status ao abrir pra prepopular tudo (inclui o caso de
  // vários homenageados: a história já traz todos os nomes).
  useEffect(() => {
    let alive = true
    fetch(`${API_URL}/api/order/${order.id}/status`).then(r => r.json()).then(d => {
      if (!alive || !d) return
      if (d.final_lyrics) setLyrics(prev => prev || d.final_lyrics)
      if (typeof d.lyric_regen_count === 'number') setGenLeft(Math.max(0, MSE_MAX_GENS - d.lyric_regen_count))
      setForm(f => ({
        honoree_name: f.honoree_name || d.honoree_name || '',
        story: f.story || d.story || '',
        genre: f.genre || d.genre || d.style_raw || '',
        occasion: f.occasion || d.occasion || '',
        voice: f.voice || mseVoiceLabel(d.voice_preference),
      }))
    }).catch(() => {})
    return () => { alive = false }
  }, [order.id])

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // Lista de ritmos: garante que o ritmo atual do pedido apareça mesmo fora da lista.
  const ritmoList = form.genre && !MSE_RITMOS.includes(form.genre) ? [form.genre, ...MSE_RITMOS] : MSE_RITMOS
  const ritmosShown = showMoreRitmos ? ritmoList : ritmoList.slice(0, MSE_RITMOS_CORE)

  // Geração de letra via backend (GPT). Modo 'data' = a partir dos campos;
  // 'instruction' = aplica o texto livre na letra atual. O aviso "✨…" fica FORA
  // da textarea — a letra nunca é poluída (nada disso vai pro Suno).
  const genLyrics = async (mode) => {
    if (genLeft <= 0 || busy) return
    if (mode === 'instruction' && !instruction.trim()) return
    setBusy(true); setErr('')
    try {
      const body = mode === 'instruction'
        ? { mode: 'instruction', instruction: instruction.trim(), currentLyrics: lyrics }
        : { mode: 'data', fields: { honoree_name: form.honoree_name, story: form.story, genre: form.genre, occasion: form.occasion, voice: form.voice } }
      const r = await fetch(`${API_URL}/api/order/${order.id}/edit/lyrics`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(x => x.json())
      if (!r || !r.ok) {
        if (r && r.error === 'limit_reached') { setGenLeft(0); setErr('Você já usou as 3 gerações de letra. Pode editar o texto à vontade e confirmar 💛') }
        else if (r && r.error === 'already_used') setErr('Você já criou sua nova música desse pedido.')
        else setErr((r && r.message) || 'Não consegui gerar a letra agora. Tenta de novo em instantes.')
        setBusy(false); return
      }
      setLyrics(r.lyrics || '')
      setLyricNote(mode === 'instruction' ? `✨ Letra ajustada com: "${instruction.trim()}"` : `✨ Nova letra gerada dos seus dados${form.genre ? ' · ' + form.genre : ''}`)
      if (typeof r.remaining === 'number') setGenLeft(r.remaining)
      setInstruction('')
      setStep('lyrics')
    } catch { setErr('Sem conexão agora. Tenta de novo em instantes.') }
    setBusy(false)
  }

  const doConfirm = async () => {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const r = await fetch(`${API_URL}/api/order/${order.id}/edit/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics, fields: { honoree_name: form.honoree_name, story: form.story, genre: form.genre, occasion: form.occasion, voice: form.voice } }),
      }).then(x => x.json())
      if (!r || !r.ok) {
        setErr((r && r.message) || 'Não consegui iniciar a criação agora. Tenta de novo.')
        setBusy(false); return
      }
      setStep('sending')
      onConfirmed && onConfirmed()
    } catch { setErr('Sem conexão agora. Tenta de novo.'); setBusy(false); return }
    setBusy(false)
  }

  const genBtnLabel = genLeft > 0 ? `🪄 Gerar nova letra` : 'Limite de letras atingido'

  return (
    <div className="mse">
      {step !== 'sending' && (
        <div className="mse-head">
          <strong>Ajustar {order.paid_at ? 'a música' : 'a prévia'} do {order.honoree_name || 'seu homenageado'}</strong>
          <p>Você pode ajustar sua {order.paid_at ? 'música' : 'prévia'} <b>uma vez</b>, sem custo 💛 Escolha o que prefere mexer:</p>
        </div>
      )}
      {err && <div className="mse-err">{err}</div>}

      {/* ── MENU: escolher caminho ── */}
      {step === 'menu' && (
        <div className="mse-menu">
          <button type="button" className="mse-path" onClick={() => setStep('lyrics')}>
            <span className="mse-path-ic">✍️</span>
            <span className="mse-path-txt"><b>Editar a letra</b><small>Mexer direto no texto da música — ou me diga o que quer mudar</small></span>
            <span className="mse-path-arrow">›</span>
          </button>
          <button type="button" className="mse-path" onClick={() => setStep('data')}>
            <span className="mse-path-ic">🎚️</span>
            <span className="mse-path-txt"><b>Mudar os dados</b><small>Nome, história, ritmo, ocasião ou voz — e gerar uma letra nova</small></span>
            <span className="mse-path-arrow">›</span>
          </button>
          <button type="button" className="mse-cancel" onClick={onClose}>Deixa pra depois</button>
        </div>
      )}

      {/* ── DADOS: formulário → gerar letra ── */}
      {step === 'data' && (
        <div className="mse-form">
          <label className="mse-lbl">Para quem é a música
            <input className="mse-input" value={form.honoree_name} onChange={e => setField('honoree_name', e.target.value)} placeholder="Nome do homenageado" />
          </label>
          <label className="mse-lbl">A história / o que a música deve contar
            <textarea className="mse-textarea mse-textarea--sm" value={form.story} onChange={e => setField('story', e.target.value)} placeholder="Conte os detalhes, momentos, o que quer destacar…" rows={4} />
          </label>
          <span className="mse-lbl">Ritmo</span>
          <div className="mse-pills">
            {ritmosShown.map(r => (
              <button key={r} type="button" className={`mse-pill ${form.genre === r ? 'is-on' : ''}`} onClick={() => setField('genre', r)}>{r}</button>
            ))}
            {!showMoreRitmos && ritmoList.length > MSE_RITMOS_CORE && (
              <button type="button" className="mse-pill mse-pill--more" onClick={() => setShowMoreRitmos(true)}>+ Ver mais</button>
            )}
          </div>
          <span className="mse-lbl">Ocasião</span>
          <div className="mse-pills">
            {MSE_OCASIOES.map(o => (
              <button key={o} type="button" className={`mse-pill ${form.occasion === o ? 'is-on' : ''}`} onClick={() => setField('occasion', o)}>{o}</button>
            ))}
          </div>
          <span className="mse-lbl">Voz</span>
          <div className="mse-pills">
            {MSE_VOZES.map(v => (
              <button key={v} type="button" className={`mse-pill ${form.voice === v ? 'is-on' : ''}`} onClick={() => setField('voice', v)}>{v}</button>
            ))}
          </div>
          <button type="button" className="mse-gen" disabled={genLeft <= 0 || busy} onClick={() => genLyrics('data')}>
            {busy ? 'Gerando a nova letra…' : genBtnLabel}
          </button>
          <p className="mse-count">{genLeft > 0 ? `Você pode gerar uma nova letra mais ${genLeft}×` : 'Você já usou as 3 gerações de letra — pode editar o texto à vontade.'}</p>
          <button type="button" className="mse-back" onClick={() => setStep('menu')}>‹ Voltar</button>
        </div>
      )}

      {/* ── LETRA: textarea editável + instrução livre + confirmar ── */}
      {step === 'lyrics' && (
        <div className="mse-form">
          <span className="mse-lbl">A letra da sua música <small>(edite à vontade)</small></span>
          {lyricNote && <div className="mse-note">{lyricNote}</div>}
          <textarea className="mse-textarea" value={lyrics} onChange={e => setLyrics(e.target.value)} rows={12} placeholder={MSE_SAMPLE} />

          {genLeft > 0 && (
            <div className="mse-instruct">
              <span className="mse-lbl">💬 Prefere me dizer o que mudar?</span>
              <textarea className="mse-textarea mse-textarea--sm" value={instruction} onChange={e => setInstruction(e.target.value)} rows={2} placeholder="Ex.: troca o nome pra Miquéias, deixa mais alegre, tira a parte do final…" />
              <button type="button" className="mse-gen mse-gen--soft" disabled={busy || !instruction.trim()} onClick={() => genLyrics('instruction')}>
                {busy ? 'Ajustando a letra…' : '🪄 Gerar nova letra com esse ajuste'}
              </button>
            </div>
          )}
          <p className="mse-count">{genLeft > 0 ? `Você pode gerar uma nova letra mais ${genLeft}×` : 'Você já usou as 3 gerações — pode editar o texto acima à vontade.'}</p>

          <button type="button" className="mse-confirm" disabled={busy || !lyrics.trim()} onClick={() => setStep('confirm')}>
            ✅ Confirmar e criar minha nova {order.paid_at ? 'música' : 'prévia'}
          </button>
          <button type="button" className="mse-back" onClick={() => setStep('menu')}>‹ Voltar</button>
        </div>
      )}

      {/* ── CONFIRM: aviso de ação única ── */}
      {step === 'confirm' && (
        <div className="mse-confirmbox">
          <div className="mse-confirm-ic">🎶</div>
          <strong>Criar sua nova {order.paid_at ? 'música' : 'prévia'}?</strong>
          {order.paid_at
            ? <p>Vou criar <b>2 versões novas</b>{order.plan === 'completa' ? ' + um vídeo novo com a letra' : ''} a partir dessa letra. Suas <b>2 versões atuais continuam salvas</b> aqui.</p>
            : <p>Vou criar uma <b>nova prévia</b> da sua música a partir dessa letra. Depois é só finalizar o pagamento pra liberar a versão completa 😉</p>}
          <p className="mse-warn">⚠️ Esse ajuste é <b>único</b> — depois de criar, não dá pra editar de novo (só criar outra do zero).</p>
          <button type="button" className="mse-confirm" disabled={busy} onClick={doConfirm}>{busy ? 'Enviando…' : `Sim, criar minha nova ${order.paid_at ? 'música' : 'prévia'}`}</button>
          <button type="button" className="mse-back" onClick={() => setStep('lyrics')}>‹ Rever a letra</button>
        </div>
      )}

      {/* ── SENDING: em produção ── */}
      {step === 'sending' && (
        <div className="mse-sending">
          <div className="mse-sending-ic">🎼</div>
          <strong>Sua nova {order.paid_at ? 'música' : 'prévia'} está sendo criada!</strong>
          {order.paid_at
            ? <p>Fica pronta em <b>5 a 10 minutinhos</b>. Assim que ficar, eu te aviso por <b>e-mail</b> e ela aparece aqui automaticamente — com as 2 versões novas junto das atuais 💛</p>
            : <p>Fica pronta em <b>5 a 10 minutinhos</b> e aparece aqui automaticamente. Aí é só <b>finalizar o pagamento</b> pra liberar a música completa 💛</p>}
          <button type="button" className="mse-confirm" onClick={onClose}>Entendi!</button>
        </div>
      )}
    </div>
  )
}
