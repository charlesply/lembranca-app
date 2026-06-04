import { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import {
  GENRES, MOODS, VOICES, TEAMS, RELATIONSHIPS, TRAITS, EX_TONES,
  OCCASIONS, FEELINGS, TOP_GENRE_LABELS, INFANTIL_GENRE,
  pron, ele, genderTrait,
} from './quizConfig'

/* ══════════════════════════════════════════════════════════════
   QUIZ — motor genérico, data-driven (quizConfig.js).
   Coleta as respostas, monta uma `story` rica em português e
   chama onComplete(data) com o MESMO payload que o handleSubmit do
   App espera (honoreeName, relationship, story, genre, mood, voice,
   clientName, phone...). Reaproveita apiTranscribe + phoneMask via props.

   Melhorias da rodada atual:
   - Persistência local (localStorage hc_quiz_draft, 7 dias TTL)
   - Persistência incremental no backend (cria draft order ao validar
     o nome e atualiza colunas a cada step via apiOrderUpdate)
   - Eyebrow de seção ("Pra quem · Sobre eles · Estilo · Pra você")
   - Tela `review` antes do submit com resumo + botão "Voltar e editar"
   - Placeholder rotativo (a cada 4s) em campos abertos
   - Idade validada 0–110
   - Áudio com aviso aos 90s e auto-stop aos 120s (limite de qualidade)
   - ARIA: role=progressbar/alert + focus-visible + aria-live
   - Telemetria: track('QuizStep') a cada mudança de tela
══════════════════════════════════════════════════════════════ */

const MIN_OPEN_CHARS = 50   // ~10 palavrinhas. Decisao do dono: 80 era muito cobrança
const AUDIO_WARN_SEC = 90
const AUDIO_MAX_SEC  = 120
const DRAFT_KEY = 'hc_quiz_draft'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000  // 7 dias

// Converte caracteres restantes em palavras aproximadas (média PT-BR ~5).
// Retorna { msg, severity } — 'danger' quando muito longe do mínimo, 'warning' quando perto.
const wordsLeftHint = (val) => {
  const len = (val || '').trim().length
  if (len >= MIN_OPEN_CHARS) return null
  const chars = MIN_OPEN_CHARS - len
  const words = Math.max(1, Math.ceil(chars / 5))
  // Linguagem progressiva — quanto mais perto, mais carinhoso:
  //   muito longe (10+ palavras): "Tá começando! Escreve mais um pouquinho"
  //   perto       (4-10):         "Quase lá! Só mais X palavrinhas"
  //   bem perto   (1-3):          "Falta pouquinho! Mais X e pronto"
  // Sem números técnicos tipo "~16"; usamos "uns" pra soar natural.
  const msg = words >= 10
    ? `Tá começando! Escreve mais um pouquinho — uns ${words} palavras e a música fica caprichada 💜`
    : words >= 4
      ? `Quase lá! Só mais ${words} palavrinhas e tá perfeita 💜`
      : `Falta pouquinho! Mais ${words} palavrinha${words > 1 ? 's' : ''} e pronto 💜`
  // < 50% do mínimo = alerta vermelho com ícone; > 50% = aviso terracota suave
  const severity = len < MIN_OPEN_CHARS * 0.5 ? 'danger' : 'warning'
  return { severity, msg }
}

/* ─────────── Validadores de nome ───────────
   Regras portadas do chat da Bia (App.jsx) — mantém consistência entre
   os dois fluxos e impede "gdhghfhgfh" / "okkdasodaok" de virar nome. */
const NAME_OK_CHARS = /^[A-Za-zÀ-ÿ'’.\-\s]+$/
const VOWEL_RE = /[aeiouyàáâãéêíóôõúAEIOUYÀÁÂÃÉÊÍÓÔÕÚ]/
// 3+ consoantes consecutivas — raríssimo em PT-BR (max 2 em "Pedro", "Lucas").
// Pega "okkdasodaok" (kkd), "xrtblpw" etc. Sem falsos positivos em nomes brasileiros comuns.
const CONSONANT_RUN = /[bcdfghjklmnpqrstvwxyzçBCDFGHJKLMNPQRSTVWXYZÇ]{3,}/
// Letras dobradas RARAS em PT (kk/ww/yy/zz/qq/xx/jj/hh) — sinal claro de teclado batido.
const DOUBLE_RARE = /(kk|ww|yy|zz|qq|xx|jj|hh)/i
// 3 letras iguais (aaa, kkk) — sinal claro de spam.
const TRIPLE_LETTER = /(.)\1{2,}/i

// nome individual (só primeiro nome ou apelido)
const validateName = (s) => {
  const v = (s || '').trim()
  if (!v) return null
  if (v.length < 2) return 'Coloca o nome certinho 😊'
  if (!NAME_OK_CHARS.test(v)) return 'O nome só pode ter letras 😊'
  if (!VOWEL_RE.test(v)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  if (TRIPLE_LETTER.test(v)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  if (DOUBLE_RARE.test(v)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  if (CONSONANT_RUN.test(v)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  if (v.split(/\s+/).some(w => w.length > 15)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  return null
}

// nome + sobrenome (pra contato do cliente)
const validateFullName = (s) => {
  const v = (s || '').trim()
  if (!v) return null
  const words = v.split(/\s+/).filter(Boolean)
  if (!NAME_OK_CHARS.test(v)) return 'O nome só pode ter letras 😊'
  if (words.filter(w => w.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 2).length < 2) return 'Coloca seu nome e sobrenome 😊'
  if (!VOWEL_RE.test(v)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  if (TRIPLE_LETTER.test(v)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  if (DOUBLE_RARE.test(v)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  if (CONSONANT_RUN.test(v)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  if (words.some(w => w.length > 15)) return 'Esse nome parece estranho 🤔 Confere pra mim?'
  return null
}

// idade plausível (0–110). `required` torna o campo obrigatório (usado em childInfo).
const validateAge = (s, required = false) => {
  const v = (s || '').trim()
  if (!v) return required ? 'Coloca a idade 😊' : null
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return 'A idade tem que ser só número 😊'
  if (n < 0 || n > 110) return 'Essa idade parece estranha 🤔'
  return null
}

/* ─────────── Placeholders rotativos · estimula escrita ───────────
   Trocam a cada 4s pra dar ideias ao usuário em vez do textarea em branco. */
const PH_BY_KIND = {
  childOpen: [
    'Conta a brincadeira favorita de vocês…',
    'Ele(a) adora qual desenho ou personagem?',
    'Um apelido carinhoso que vocês usam…',
    'Como ele(a) é no dia a dia?',
  ],
  romanticHow: [
    'Conta como vocês se conheceram…',
    'O primeiro encontro ficou marcado?',
    'O lugar onde tudo começou…',
  ],
  romanticMoment: [
    'Um momento especial de vocês…',
    'A viagem que mudou tudo, o casamento, um aniversário…',
    'Aquele dia que vocês ainda lembram juntos.',
  ],
  parentOpen: [
    'Uma lembrança da sua infância com ele(a)…',
    'Um conselho que mudou sua vida…',
    'Um jeitinho dele(a) que você ama…',
  ],
  default: [
    'Escreva ou toque no microfone pra contar por áudio…',
    'Conta um momento marcante.',
    'O que ele(a) significa pra você?',
  ],
}
const useRotatingPlaceholder = (key) => {
  const list = PH_BY_KIND[key] || PH_BY_KIND.default
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI(x => (x + 1) % list.length), 4000)
    return () => clearInterval(id)
  }, [list])
  return list[i]
}

/* ─────────── Draft localStorage helpers ─────────── */
const loadDraft = () => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || !d.t || (Date.now() - d.t) > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY); return null
    }
    return d
  } catch (_) { return null }
}
const saveDraft = (state) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...state, t: Date.now() })) } catch (_) {}
}
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY) } catch (_) {} }

/* ─────────── Junta lista de nomes com "&" estilo capa de album ───────────
   Usado no honoreeName quando ha varios filhos. Conserta o bug do
   titulo "Para Marcos" quando o usuario colocou Marcos E Marlene:
     []                -> ''
     ['Marcos']        -> 'Marcos'
     ['Marcos','Marlene'] -> 'Marcos & Marlene'
     ['A','B','C']     -> 'A, B & C'
   "&" no lugar de "e" pra dar uma vibe mais autoral, tipo capa de
   album (Simon & Garfunkel, Hall & Oates). Strings vazias/so-espacos
   sao ignoradas. */
function joinNames(names) {
  const list = (names || []).map(n => (n || '').trim()).filter(Boolean)
  if (list.length === 0) return ''
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} & ${list[1]}`
  return `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`
}

/* ─────────── Mapeia screen → seção pro eyebrow ───────────
   Mantemos só 4 seções claras (sem números, sem ambiguidade).
   O contador total fica à direita do header como "X / Y". */
const SECTION_OF = (screenType) => {
  switch (screenType) {
    case 'relationship': return 'Pra quem'
    case 'name': case 'count': case 'childInfo':
      return 'Quem é'
    case 'childTraits': case 'childOpen': case 'childTeam':
    case 'traits': case 'open': case 'exTone': case 'team':
      return 'A história'
    case 'occasion': return 'A história'
    case 'feeling': case 'genre': case 'mood': case 'voice': return 'O som'
    case 'review': case 'contact': return 'Pra você'
    default: return ''
  }
}

/* ─────────── Botão de áudio (gravar → transcrever → preenche texto) ──
   Expõe um método imperativo `stopAndAwait()` via exposeStop ref:
   o pai chama isso quando o usuário clica "Continuar" enquanto
   o microfone está ativo — assim o áudio é parado, transcrito e
   salvo no campo atual antes de avançar. */
function AudioField({ value, onChange, placeholder, apiTranscribe, exposeStop, onActiveChange }) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [secs, setSecs] = useState(0)
  const mrRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const cancelRef = useRef(false)
  const donePromiseRef = useRef(null)

  const start = async () => {
    if (recording || transcribing) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      mrRef.current = mr
      chunksRef.current = []
      cancelRef.current = false
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        clearInterval(timerRef.current)
        setRecording(false)
        if (cancelRef.current) { setSecs(0); return }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        setSecs(0)
        if (blob.size < 1200) return
        setTranscribing(true)
        try {
          const text = await apiTranscribe(blob)
          if (text) onChange((value ? value + ' ' : '') + text)
          else alert('Não consegui entender o áudio. Pode tentar de novo ou escrever 💜')
        } catch (_) { alert('Não consegui transcrever o áudio agora. Pode escrever? 💜') }
        finally { setTranscribing(false) }
      }
      mr.start()
      setRecording(true); setSecs(0)
      timerRef.current = setInterval(() => setSecs(s => {
        const next = s + 1
        // Auto-stop no limite (qualidade da transcrição cai fora dessa janela).
        if (next >= AUDIO_MAX_SEC) { try { mrRef.current?.stop() } catch (_) {} }
        return next
      }), 1000)
    } catch (_) {
      alert('Preciso da permissão do microfone pra gravar. Você também pode escrever 💜')
    }
  }
  const stop = () => { cancelRef.current = false; try { mrRef.current?.stop() } catch (_) {} }
  const cancel = () => { cancelRef.current = true; try { mrRef.current?.stop() } catch (_) {} }

  useEffect(() => { onActiveChange && onActiveChange({ recording, transcribing }) }, [recording, transcribing, onActiveChange])

  useEffect(() => {
    if (!recording && !transcribing && donePromiseRef.current) {
      const res = donePromiseRef.current
      donePromiseRef.current = null
      res()
    }
  }, [recording, transcribing])

  useEffect(() => {
    if (!exposeStop) return
    exposeStop.current = () => new Promise((resolve) => {
      if (!recording && !transcribing) return resolve()
      donePromiseRef.current = resolve
      if (recording) stop()
    })
    return () => { if (exposeStop && exposeStop.current) exposeStop.current = null }
  }, [recording, transcribing, exposeStop])

  // mensagem do tempo: muda quando se aproxima do limite
  const timeMsg = recording
    ? (secs >= AUDIO_WARN_SEC
        ? `Quase no limite (${AUDIO_MAX_SEC - secs}s) — encerre logo 💜`
        : 'Gravando… toque pra enviar')
    : null

  return (
    <div className="quiz-audiofield">
      <textarea
        className="quiz-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={recording || transcribing}
      />
      {recording ? (
        <div className="quiz-recbar" role="status" aria-live="polite">
          <button type="button" className="quiz-rec-cancel" onClick={cancel} aria-label="Cancelar gravação">✕</button>
          <span className="quiz-rec-dot" aria-hidden="true" />
          <span className="quiz-rec-time">{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>
          <span className="quiz-rec-hint">{timeMsg}</span>
          <button type="button" className="quiz-mic-btn stop" onClick={stop} aria-label="Enviar áudio">⏹</button>
        </div>
      ) : transcribing ? (
        <div className="quiz-recbar" role="status" aria-live="polite">
          <span className="quiz-spinner" aria-hidden="true" />
          <span className="quiz-rec-hint">Transcrevendo seu áudio…</span>
        </div>
      ) : (
        <button type="button" className="quiz-mic-btn" onClick={start}>
          🎤 Falar por áudio
        </button>
      )}
    </div>
  )
}

/* ── Chips multi-seleção (traits/destaques) ── */
function ChipMulti({ options, gender, selected, onToggle }) {
  return (
    <div className="quiz-chips" role="group">
      {options.map(opt => {
        const label = genderTrait(opt, gender)
        const on = selected.includes(label)
        return (
          <button key={opt} type="button" className={`pill${on ? ' selected' : ''}`}
            aria-pressed={on} onClick={() => onToggle(label)}>{label}</button>
        )
      })}
    </div>
  )
}

/* ── Team picker (chips + Não sei/Nenhum + Outro + Pular) ── */
function TeamPicker({ value, onChange, onSkip }) {
  const [other, setOther] = useState('')
  const [showOther, setShowOther] = useState(false)
  return (
    <div>
      <div className="quiz-chips" role="radiogroup">
        {TEAMS.map(t => (
          <button key={t} type="button" className={`pill${value === t ? ' selected' : ''}`}
            role="radio" aria-checked={value === t}
            onClick={() => { setShowOther(false); onChange(t) }}>{t}</button>
        ))}
        <button type="button" className={`pill${value === 'Não sei/Nenhum' ? ' selected' : ''}`}
          role="radio" aria-checked={value === 'Não sei/Nenhum'}
          onClick={() => { setShowOther(false); onChange('Não sei/Nenhum') }}>Não sei/Nenhum</button>
        <button type="button" className={`pill${showOther ? ' selected' : ''}`}
          onClick={() => { setShowOther(true); onChange('') }}>Outro</button>
      </div>
      {showOther && (
        <input className="input-text" style={{ marginTop: 12 }} value={other} placeholder="Digite o time..."
          onChange={e => { setOther(e.target.value); onChange(e.target.value, { fromInput: true }) }} autoFocus />
      )}
      <button type="button" className="quiz-skip" onClick={onSkip}>Pular ⤳</button>
    </div>
  )
}

export default function Quiz({ onComplete, onChat, phoneMask, apiTranscribe, apiCreateOrder, apiOrderUpdate, track, loading }) {
  /* ── Hidrata o estado do localStorage se houver draft fresco (≤ 7 dias) ── */
  const initDraft = useMemo(() => loadDraft(), [])

  const [si, setSi] = useState(initDraft?.si || 0)
  const [rel, setRel] = useState(() => {
    if (!initDraft?.relId) return null
    return RELATIONSHIPS.find(r => r.id === initDraft.relId) || null
  })
  const [honoree, setHonoree] = useState(initDraft?.honoree || '')
  const [count, setCount] = useState(initDraft?.count || 1)
  const [children, setChildren] = useState(initDraft?.children || [])
  const [traits, setTraits] = useState(initDraft?.traits || [])
  const [open1, setOpen1] = useState(initDraft?.open1 || '')
  const [open2, setOpen2] = useState(initDraft?.open2 || '')
  const [exTone, setExTone] = useState(initDraft?.exTone || '')
  const [team, setTeam] = useState(initDraft?.team || '')
  const [occasion, setOccasion] = useState(initDraft?.occasion || '')
  const [feeling, setFeeling] = useState(initDraft?.feeling || '')
  const [genre, setGenre] = useState(initDraft?.genre || '')
  const [mood, setMood] = useState(initDraft?.mood || '')
  const [voice, setVoice] = useState(initDraft?.voice || '')
  const [clientName, setClientName] = useState(initDraft?.clientName || '')
  const [phone, setPhone] = useState(initDraft?.phone || '')
  const [relExpanded, setRelExpanded] = useState(false)
  const [genreExpanded, setGenreExpanded] = useState(false)
  const [showResumeBanner, setShowResumeBanner] = useState(!!initDraft?.relId)
  // Banner "Achei um rascunho seu" deve sumir assim que o usuario AVANCA
  // de qualquer step — significa que ele aceitou implicitamente continuar
  // de onde parou. Antes ficava preso ate ele clicar "Continuar" no proprio
  // banner, ocupando espaco em todas as telas subsequentes do quiz.
  const initialSiRef = useRef(initDraft?.si || 0)

  const [audioState, setAudioState] = useState({ recording: false, transcribing: false })
  const audioStopRef = useRef(null)

  // id do pedido draft no Supabase (persistência incremental)
  const draftOrderIdRef = useRef(initDraft?.draftOrderId || null)
  const lastSavedJsonRef = useRef(null)   // pra evitar mandar PATCH com mesmo payload

  // flag: quando o usuário clica "Editar" na review, vamos pra tela específica.
  // Ao confirmar a edição (Continuar OU auto-advance), volta DIRETO pra review
  // em vez de seguir step-by-step o resto do fluxo.
  const returnToReviewRef = useRef(false)

  /* ── monta a lista de telas dinamicamente conforme a relação ── */
  const screens = useMemo(() => {
    const s = [{ type: 'relationship' }]
    if (!rel) return s

    if (rel.kind === 'child') {
      s.push({ type: 'count' })
      for (let i = 0; i < count; i++) {
        s.push({ type: 'childInfo', idx: i })
        s.push({ type: 'childTraits', idx: i })
        s.push({ type: 'childOpen', idx: i })
        const c = children[i] || {}
        const age = Number(c.age || 0)
        if (rel.team && age > 0 && age <= 16) {
          s.push({ type: 'childTeam', idx: i })
        }
      }
    } else {
      s.push({ type: 'name' })
      if (rel.kind === 'romantic') {
        s.push({ type: 'traits', list: TRAITS.romantic, q: `O que mais te encanta ${pron(rel.gender) === 'dela' ? 'nela' : 'nele'}?` })
        s.push({ type: 'open', field: 'open1', q: 'Como vocês se conheceram?', phKind: 'romanticHow' })
        s.push({ type: 'open', field: 'open2', q: 'Um momento especial de vocês?', phKind: 'romanticMoment' })
      } else if (rel.kind === 'ex') {
        s.push({ type: 'exTone' })
        s.push({ type: 'open', field: 'open1', q: 'O que marcou o relacionamento de vocês?', phKind: 'romanticMoment' })
      } else if (rel.kind === 'parent') {
        s.push({ type: 'traits', list: TRAITS.parent, q: `O que você mais admira ${rel.possIn || (rel.gender === 'f' ? 'nela' : 'nele')}?` })
        s.push({ type: 'open', field: 'open1', q: 'Uma lembrança ou ensinamento que ficou?', phKind: 'parentOpen' })
      } else if (rel.kind === 'sibling') {
        s.push({ type: 'traits', list: TRAITS.sibling, q: `O que mais marca ${pron(rel.gender) === 'dela' ? 'nela' : 'nele'}?` })
        s.push({ type: 'open', field: 'open1', q: `Conta um momento marcante de vocês`, phKind: 'default' })
      } else if (rel.kind === 'grandparent') {
        s.push({ type: 'traits', list: TRAITS.grandparent, q: `O que mais marca ${pron(rel.gender) === 'dela' ? 'nela' : 'nele'}?` })
        s.push({ type: 'open', field: 'open1', q: `O que ${honoree || 'essa pessoa'} significa pra você?`, phKind: 'default' })
      } else if (rel.kind === 'friend') {
        s.push({ type: 'traits', list: TRAITS.friend, q: `O que mais marca ${pron(rel.gender) === 'dela' ? 'nela' : 'nele'}?` })
        s.push({ type: 'open', field: 'open1', q: `Conta um momento marcante de vocês`, phKind: 'default' })
      }
      // ★ Ocasião — pra contextualizar a letra (pedido, casamento, saudade…).
      s.push({ type: 'occasion' })
      // ★ Sentimento — só pra relações adultas (não-child).
      // Capta a emoção principal antes do som musical.
      s.push({ type: 'feeling' })
    }

    s.push({ type: 'genre' })
    s.push({ type: 'mood' })
    s.push({ type: 'voice' })
    s.push({ type: 'contact' })
    s.push({ type: 'review' })   // ★ NOVO — resumo antes de enviar
    return s
  }, [rel, count, honoree, children])

  // garante o array de crianças do tamanho certo
  useEffect(() => {
    if (rel && rel.kind === 'child') {
      setChildren(prev => {
        const next = prev.slice(0, count)
        while (next.length < count) next.push({ name: '', age: '', gender: '', traits: [], open: '', team: '' })
        return next
      })
    }
  }, [count, rel])

  useEffect(() => { audioStopRef.current = null }, [si])

  const screen = screens[Math.min(si, screens.length - 1)]
  const total = screens.length
  const sectionLabel = SECTION_OF(screen?.type)

  /* ── menor idade entre as crianças (proxy para regra "Infantil" no gênero) ── */
  const minChildAge = useMemo(() => {
    if (rel?.kind !== 'child') return 999
    const ages = children.slice(0, count).map(c => Number(c.age) || 0).filter(a => a > 0)
    return ages.length ? Math.min(...ages) : 999
  }, [children, count, rel])

  /* ── validação por tela ── */
  const canNext = () => {
    if (!screen) return false
    if (audioState.recording || audioState.transcribing) return true
    switch (screen.type) {
      case 'relationship': return !!rel
      case 'name': return honoree.trim().length > 0 && !validateName(honoree)
      case 'count': return count >= 1
      case 'childInfo': {
        const c = children[screen.idx] || {}
        return (c.name || '').trim().length > 0
          && !validateName(c.name)
          && (c.age || '').toString().trim().length > 0   // idade obrigatória
          && !validateAge(c.age, true)
          && (c.gender === 'm' || c.gender === 'f')
      }
      case 'childTraits': return true
      case 'childOpen': { const c = children[screen.idx] || {}; return (c.open || '').trim().length >= MIN_OPEN_CHARS }
      case 'childTeam': return true
      case 'traits': return true
      case 'open': {
        const val = screen.field === 'open2' ? open2 : open1
        return (val || '').trim().length >= MIN_OPEN_CHARS
      }
      case 'exTone': return !!exTone
      case 'team': return true
      case 'occasion': return !!occasion
      case 'feeling': return !!feeling
      case 'genre': return !!genre
      case 'mood': return !!mood
      case 'voice': return !!voice
      case 'contact':
        return !validateFullName(clientName)
          && clientName.trim().includes(' ')
          && phone.replace(/\D/g, '').length >= 10
      case 'review': return true
      default: return true
    }
  }

  // índice da tela de revisão (pra "Editar" voltar direto)
  const reviewIdx = useMemo(() => screens.findIndex(s => s.type === 'review'), [screens])

  const go = (dir) => {
    // Modo "edição vinda da review": ao avançar, volta direto pra review
    // em vez de cair na próxima tela do fluxo.
    if (dir > 0 && returnToReviewRef.current && reviewIdx >= 0) {
      returnToReviewRef.current = false
      setSi(reviewIdx)
      try { document.getElementById('quizCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch (_) {}
      return
    }
    const ni = si + dir
    if (ni < 0) return
    if (ni >= total) { finish(); return }
    setSi(ni)
    try { document.getElementById('quizCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch (_) {}
  }

  // handleNext = se houver áudio ativo, encerra e espera transcrição; senão go(1).
  const handleNext = async () => {
    if (audioState.recording || audioState.transcribing) {
      if (audioStopRef.current) { await audioStopRef.current() }
      return
    }
    if (!canNext()) return
    go(1)
  }

  // Auto-advance (clique em opção). Respeita o modo "voltar pra review".
  //
  // GHOST-CLICK GUARD: iOS Safari dispara um `click` SINTÉTICO ~300ms após o
  // touchend. Se a tela trocar antes desses 300ms, o clique sintético cai no
  // botão da PRÓXIMA tela que estiver no mesmo ponto (grids 3-col têm botões
  // empilhados em coords idênticas). Resultado: o próximo step abre com uma
  // opção já marcada "sozinha". Pra resolver, renderizamos um overlay
  // transparente full-screen durante a janela de swap+sintético. Ele absorve
  // qualquer touch/click que ocorra nesse intervalo.
  const advanceTimerRef = useRef(null)
  const [advancing, setAdvancing] = useState(false)
  const advance = () => {
    if (advancing) return
    setAdvancing(true)
    clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => {
      if (returnToReviewRef.current && reviewIdx >= 0) {
        returnToReviewRef.current = false
        setSi(reviewIdx)
      } else {
        setSi(s => Math.min(s + 1, screens.length))
      }
      // Mantém o overlay mais ~400ms APÓS o swap pra cobrir o click sintético
      // do iOS (que vem ~300ms depois do touchend original).
      setTimeout(() => setAdvancing(false), 420)
    }, 80)
  }

  /* ── Auto-dismiss do banner de rascunho ──
     Assim que o usuario AVANCA pra um step novo (qualquer si != initialSi),
     ele aceitou implicitamente continuar. Esconde o banner em vez de ficar
     ocupando espaco em todas as telas. */
  useEffect(() => {
    if (!showResumeBanner) return
    if (si !== initialSiRef.current) setShowResumeBanner(false)
  }, [si, showResumeBanner])

  /* ── Telemetria por step ── */
  const lastTrackedSiRef = useRef(-1)
  useEffect(() => {
    if (!track) return
    if (lastTrackedSiRef.current === si) return
    lastTrackedSiRef.current = si
    try {
      track('QuizStep', {
        step: si + 1,
        total,
        screen: screen?.type || 'unknown',
        section: sectionLabel,
        relationship: rel?.id || null,
      }, true)
    } catch (_) {}
  }, [si, screen, total, sectionLabel, rel, track])

  /* ── Draft localStorage · salva todo estado serializável a cada mudança ── */
  useEffect(() => {
    if (!rel && !honoree) return  // ainda em branco
    saveDraft({
      si, relId: rel?.id || null,
      honoree, count, children, traits, open1, open2, exTone, team,
      occasion, feeling, genre, mood, voice, clientName, phone,
      draftOrderId: draftOrderIdRef.current,
    })
  }, [si, rel, honoree, count, children, traits, open1, open2, exTone, team, occasion, feeling, genre, mood, voice, clientName, phone])

  /* ── Trilha de eventos do quiz (cracker analytics) ──
     Mantém em ref pra não causar re-render; cada step adiciona uma linha
     "step|screen|ts" e a gente manda inteira via apiOrderUpdate. Cap em 80
     entradas (cabe no varchar 8000 do backend folgado). */
  const eventsLogRef = useRef('')
  useEffect(() => {
    if (!screen?.type) return
    const line = `${si + 1}|${screen.type}|${Date.now()}`
    const arr = (eventsLogRef.current ? eventsLogRef.current.split('\n') : [])
    arr.push(line)
    if (arr.length > 80) arr.splice(0, arr.length - 80)
    eventsLogRef.current = arr.join('\n')
  }, [si, screen?.type])

  /* ── Persistência incremental no Supabase via apiOrderUpdate ──
     Cria o pedido draft assim que existe um nome válido (honoree ou children[0].name)
     e mantém os campos sincronizados depois disso.

     last_screen + events_log dão visibilidade EXATA de onde cada lead
     parou e a sequência de telas visitadas (crackable no painel admin). */
  const buildIncrementalFields = useCallback(() => {
    const honoreeFromChildren = joinNames(children.slice(0, count).map(c => c?.name))
    const honoree_name = rel?.kind === 'child' ? honoreeFromChildren : honoree
    return {
      honoree_name: honoree_name || null,
      customer_name: clientName || null,
      story: buildStoryStr() || null,
      style_raw: [genre, mood, voice].filter(Boolean).join(' | ') || null,
      genre: genre || null,
      mood: mood || null,
      voice_preference: voice || null,
      relationship: rel?.label || null,
      last_screen: screen?.type || null,
      events_log: eventsLogRef.current || null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel, honoree, children, clientName, genre, mood, voice, screen?.type, si])

  // story local helper (mesma lógica do builder final) — usado pra incremental
  function buildStoryStr() {
    if (!rel) return ''
    return buildStoryInternal(rel, children, count, honoree, traits, open1, open2, exTone, team, feeling)
  }

  // criação do draft order: dispara 1x quando temos nome válido + phone OU em qualquer momento depois do contact
  useEffect(() => {
    if (!apiCreateOrder) return
    if (draftOrderIdRef.current) return
    const cleanPhone = (phone || '').replace(/\D/g, '')
    const haveName = rel?.kind === 'child'
      ? (children[0]?.name && !validateName(children[0].name))
      : (honoree && !validateName(honoree))
    // só cria quando tem nome E (já passou pela tela de contato OU já temos telefone preenchido)
    if (!haveName) return
    if (cleanPhone.length < 10 && screen?.type !== 'review') return
    ;(async () => {
      try {
        const fields = buildIncrementalFields()
        const body = {
          phone: cleanPhone || '',
          honoree_name: fields.honoree_name || 'rascunho',
          customer_name: fields.customer_name,
          story: fields.story,
          style_raw: fields.style_raw,
          genre: fields.genre,
          mood: fields.mood,
          voice: fields.voice_preference,
          relationship: fields.relationship,
          // tracking: backend ignora se as colunas não existirem
          last_screen: fields.last_screen,
          events_log: fields.events_log,
        }
        const r = await apiCreateOrder(body)
        if (r && r.orderId) {
          draftOrderIdRef.current = r.orderId
          saveDraft({ si, relId: rel?.id, honoree, count, children, traits, open1, open2, exTone, team, occasion, feeling, genre, mood, voice, clientName, phone, draftOrderId: r.orderId })
        }
      } catch (_) {}
    })()
  }, [phone, honoree, children, rel, screen?.type, apiCreateOrder, buildIncrementalFields, si, traits, open1, open2, exTone, team, genre, mood, voice, clientName, count])

  // PATCH incremental: cada mudança relevante sincroniza campos com o backend
  useEffect(() => {
    if (!apiOrderUpdate || !draftOrderIdRef.current) return
    const fields = buildIncrementalFields()
    const json = JSON.stringify(fields)
    if (json === lastSavedJsonRef.current) return
    lastSavedJsonRef.current = json
    // debounce 600ms pra não floodar
    const id = setTimeout(() => { apiOrderUpdate(draftOrderIdRef.current, fields) }, 600)
    return () => clearTimeout(id)
  }, [apiOrderUpdate, buildIncrementalFields])

  const setChild = (idx, patch) => setChildren(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))

  /* ── montagem da STORY (linguagem natural PT-BR) ── */
  function buildStoryInternal(rel, children, count, honoree, traits, open1, open2, exTone, team, feeling) {
    const g = rel.gender
    const parts = []
    if (rel.kind === 'child') {
      children.slice(0, count).forEach(c => {
        if (!c.name) return
        const cg = c.gender || 'm'
        const poss = (rel.posesByGender && rel.posesByGender[cg]) || rel.poss || 'pessoa especial'
        let p = `${c.name} é ${poss}`
        if (c.age) p += ` de ${c.age} anos`
        p += '.'
        if (c.traits && c.traits.length) p += ` ${ele(cg)} é ${c.traits.join(', ')}.`
        if (c.open) p += ` ${c.open.trim().replace(/\.?$/, '.')}`
        if (c.team && c.team !== 'Não sei/Nenhum') p += ` Torce pro ${c.team}.`
        parts.push(p)
      })
    } else if (rel.kind === 'romantic') {
      let p = `Quero uma música pra ${rel.poss} ${honoree}.`
      if (traits.length) p += ` ${ele(g)} é ${traits.join(', ')}.`
      if (open1) p += ` Nos conhecemos: ${open1.trim().replace(/\.?$/, '.')}`
      if (open2) p += ` Um momento especial nosso: ${open2.trim().replace(/\.?$/, '.')}`
      parts.push(p)
    } else if (rel.kind === 'ex') {
      let p = `Quero uma música pra ${rel.label} ${honoree}, com tom de ${exTone || 'saudade'}.`
      if (open1) p += ` O que marcou nosso relacionamento: ${open1.trim().replace(/\.?$/, '.')}`
      parts.push(p)
    } else if (rel.kind === 'parent') {
      let p = `Quero uma música pra ${rel.poss}, ${honoree}.`
      if (traits.length) p += ` Admiro ${rel.possIn || (g === 'f' ? 'nela' : 'nele')} ser ${traits.join(', ')}.`
      if (open1) p += ` Uma lembrança/ensinamento: ${open1.trim().replace(/\.?$/, '.')}`
      parts.push(p)
    } else {
      let p = `Quero uma música pra ${rel.poss} ${honoree}.`
      if (traits.length) p += ` ${ele(g)} é ${traits.join(', ')}.`
      if (open1) p += ` ${open1.trim().replace(/\.?$/, '.')}`
      parts.push(p)
    }
    // ★ Sentimento principal — orienta a IA na escolha de linha melódica.
    if (feeling && rel.kind !== 'child') {
      parts.push(`O sentimento principal é: ${feeling.toLowerCase()}.`)
    }
    return parts.join(' ')
  }

  const buildStory = () => buildStoryInternal(rel, children, count, honoree, traits, open1, open2, exTone, team, feeling)

  const finish = () => {
    const story = buildStory()
    // Quando ha varios filhos (count > 1), monta a lista com vírgula + " e ":
    //   1 filho:  "Marcos"             -> titulo "Para Marcos"
    //   2 filhos: "Marcos e Marlene"   -> titulo "Para Marcos e Marlene"
    //   3 filhos: "A, B e C"           -> titulo "Para A, B e C"
    const childrenJoined = (rel.kind === 'child')
      ? joinNames(children.slice(0, count).map(c => c?.name))
      : ''
    const honoreeName = (rel.kind === 'child' ? (childrenJoined || honoree) : honoree).trim()
    const data = {
      honoreeName,
      relationship: rel.label,
      occasion: (occasion && occasion !== 'Sem ocasião específica') ? occasion : '',
      story,
      genre, mood, voice,
      clientName: clientName.trim(),
      phone,
      orderId: draftOrderIdRef.current,  // o App reaproveita se houver
    }
    try { track && track('QuizComplete', { relationship: rel.id }, true) } catch (_) {}
    clearDraft()
    onComplete(data)
  }

  const resetEverything = () => {
    clearDraft()
    draftOrderIdRef.current = null
    setSi(0); setRel(null); setHonoree(''); setCount(1); setChildren([])
    setTraits([]); setOpen1(''); setOpen2(''); setExTone(''); setTeam('')
    setGenre(''); setMood(''); setVoice(''); setClientName(''); setPhone('')
    setShowResumeBanner(false)
  }

  /* ── render de cada tela ── */
  const renderScreen = () => {
    const g = rel?.gender
    switch (screen.type) {
      case 'relationship': {
        const TOP = ['esposo', 'esposa', 'namorado', 'namorada', 'filho_a', 'neto_a']
        const top = TOP.map(id => RELATIONSHIPS.find(r => r.id === id)).filter(Boolean)
        const rest = RELATIONSHIPS.filter(r => !TOP.includes(r.id))
        const shown = relExpanded ? [...top, ...rest] : top
        return (
          <>
            <h2 className="quiz-q">Pra quem você quer fazer essa música? 💜</h2>
            <div className="quiz-rel-grid" role="radiogroup" aria-label="Relação com o homenageado">
              {shown.map(r => (
                <button key={r.id} type="button"
                  className={`quiz-rel-card${rel?.id === r.id ? ' selected' : ''}`}
                  role="radio" aria-checked={rel?.id === r.id}
                  onClick={() => {
                    setRel(r)
                    if (r.kind === 'child') setCount(r.plural ? 2 : 1)
                    advance()
                  }}>
                  <span className="quiz-rel-ic" aria-hidden="true">{r.icon}</span>
                  <span className="quiz-rel-label">{r.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="quiz-rel-more" onClick={() => setRelExpanded(v => !v)}
              aria-expanded={relExpanded}>
              {relExpanded ? 'Ver menos ▲' : 'Ver mais relações ▼'}
            </button>
          </>
        )
      }

      case 'name': {
        const err = validateName(honoree)
        return (
          <>
            <h2 className="quiz-q">Qual o nome {pron(g)}?</h2>
            <input className="input-text" value={honoree} onChange={e => setHonoree(e.target.value)} placeholder="Digite o nome..." autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && canNext()) handleNext() }} aria-invalid={!!err} />
            {err && <p className="quiz-hint" style={{ marginTop: 8, color: 'var(--c-danger)' }} role="alert">{err}</p>}
          </>
        )
      }

      case 'count':
        return (
          <>
            <h2 className="quiz-q">Quantos você quer homenagear?</h2>
            <div className="quiz-num-grid" role="radiogroup" aria-label="Quantidade de homenageados">
              {[1, 2, 3, 4].map(n => (
                <button key={n} type="button" className={`quiz-num${count === n ? ' selected' : ''}`}
                  role="radio" aria-checked={count === n}
                  onClick={() => { setCount(n); advance() }}>{n}</button>
              ))}
            </div>
          </>
        )

      case 'childInfo': {
        const c = children[screen.idx] || {}
        const nameErr = validateName(c.name)
        // só mostra "Coloca a idade" se o usuário já interagiu com o campo
        const ageErr = (c.age || '').toString().length > 0 ? validateAge(c.age, true) : null
        // Linguagem reativa: muda título conforme o gênero que o usuário marca.
        // 1 filho: "Pra quem é a música?". 2+: usa palavras (primeiro/primeira)
        // pra ficar natural — fica curto e o sexo concorda com o que ele acabou
        // de selecionar.
        const ordM = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto']
        const ordF = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta']
        const i = screen.idx
        const isF = c.gender === 'f'
        const title = count === 1
          ? 'Pra quem é a música?'
          : (c.gender
              ? (isF ? `Sobre a sua ${ordF[i] || (i+1)+'ª'} filha` : `Sobre o seu ${ordM[i] || (i+1)+'º'} filho`)
              : `Sobre o ${ordM[i] || (i+1)+'º'} filho(a)`)
        return (
          <>
            <h2 className="quiz-q">{title}</h2>
            <label className="quiz-label">É menino ou menina?</label>
            <div className="voice-grid" style={{ marginBottom: 14 }} role="radiogroup" aria-label="Gênero">
              <button type="button" className={`voice-card${c.gender === 'm' ? ' selected' : ''}`}
                role="radio" aria-checked={c.gender === 'm'}
                onClick={() => setChild(screen.idx, { gender: 'm' })}>
                <span className="voice-icon" aria-hidden="true">👦</span>
                <span className="voice-label">Menino</span>
              </button>
              <button type="button" className={`voice-card${c.gender === 'f' ? ' selected' : ''}`}
                role="radio" aria-checked={c.gender === 'f'}
                onClick={() => setChild(screen.idx, { gender: 'f' })}>
                <span className="voice-icon" aria-hidden="true">👧</span>
                <span className="voice-label">Menina</span>
              </button>
            </div>
            <label className="quiz-label">Nome</label>
            <input className="input-text" value={c.name || ''} onChange={e => setChild(screen.idx, { name: e.target.value })}
              placeholder="Nome..." aria-invalid={!!nameErr} />
            {nameErr && <p className="quiz-hint" style={{ marginTop: 8, color: 'var(--c-danger)' }} role="alert">{nameErr}</p>}
            <label className="quiz-label" style={{ marginTop: 14 }}>Idade</label>
            <input className="input-text" type="number" inputMode="numeric"
              value={c.age || ''}
              onChange={e => setChild(screen.idx, { age: e.target.value.replace(/\D/g, '').slice(0, 3) })}
              placeholder="Idade..." aria-invalid={!!ageErr} />
            {ageErr && <p className="quiz-hint" style={{ marginTop: 8, color: 'var(--c-danger)' }} role="alert">{ageErr}</p>}
          </>
        )
      }

      case 'childTraits': {
        const c = children[screen.idx] || {}
        const cg = c.gender || 'm'
        const nm = c.name || 'essa pessoa'
        return (
          <>
            <h2 className="quiz-q">O que {nm} tem de especial?</h2>
            <p className="quiz-hint">Pode marcar quantas você quiser.</p>
            <ChipMulti options={TRAITS.child} gender={cg} selected={c.traits || []}
              onToggle={(label) => setChild(screen.idx, { traits: (c.traits || []).includes(label) ? c.traits.filter(t => t !== label) : [...(c.traits || []), label] })} />
          </>
        )
      }

      case 'childOpen': {
        const c = children[screen.idx] || {}
        const nm = c.name || 'a pessoa'
        const hint = wordsLeftHint(c.open || '')
        return <ChildOpenScreen c={c} nm={nm} hint={hint} setChild={setChild} idx={screen.idx}
          apiTranscribe={apiTranscribe} audioStopRef={audioStopRef} setAudioState={setAudioState} />
      }

      case 'childTeam': {
        const c = children[screen.idx] || {}
        const nm = c.name || 'a pessoa'
        return (
          <>
            <h2 className="quiz-q">{nm} torce pra algum time?</h2>
            <TeamPicker value={c.team || ''}
              onChange={(v, meta) => { setChild(screen.idx, { team: v }); if (v && !meta?.fromInput) advance() }}
              onSkip={() => { setChild(screen.idx, { team: '' }); advance() }} />
          </>
        )
      }

      case 'traits':
        return (
          <>
            <h2 className="quiz-q">{screen.q}</h2>
            <ChipMulti options={screen.list} gender={g} selected={traits}
              onToggle={(label) => setTraits(traits.includes(label) ? traits.filter(t => t !== label) : [...traits, label])} />
          </>
        )

      case 'open': {
        const field = screen.field
        const val = field === 'open2' ? open2 : open1
        const setter = field === 'open2' ? setOpen2 : setOpen1
        const hint = wordsLeftHint(val)
        return <OpenScreen q={screen.q} phKind={screen.phKind} val={val} setter={setter} hint={hint}
          apiTranscribe={apiTranscribe} audioStopRef={audioStopRef} setAudioState={setAudioState} />
      }

      case 'exTone':
        return (
          <>
            <h2 className="quiz-q">Qual o tom da música?</h2>
            <div className="quiz-chips" role="radiogroup">
              {EX_TONES.map(t => (
                <button key={t} type="button" className={`pill${exTone === t ? ' selected' : ''}`}
                  role="radio" aria-checked={exTone === t}
                  onClick={() => { setExTone(t); advance() }}>{t}</button>
              ))}
            </div>
          </>
        )

      case 'team':
        return (
          <>
            <h2 className="quiz-q">{honoree || 'A pessoa'} torce pra algum time?</h2>
            <TeamPicker value={team}
              onChange={(v, meta) => { setTeam(v); if (v && !meta?.fromInput) advance() }}
              onSkip={() => { setTeam(''); advance() }} />
          </>
        )

      case 'occasion':
        return (
          <>
            <h2 className="quiz-q">Qual a ocasião especial?</h2>
            <p className="quiz-hint">Escolha a opção que mais combina.</p>
            <div className="voice-grid quiz-feeling-grid" role="radiogroup" aria-label="Ocasião">
              {OCCASIONS.map(o => (
                <button key={o.label} type="button"
                  className={`voice-card${occasion === o.label ? ' selected' : ''}`}
                  role="radio" aria-checked={occasion === o.label}
                  onClick={() => { setOccasion(o.label); advance() }}>
                  <span className="voice-icon" aria-hidden="true">{o.icon}</span>
                  <span className="voice-label">{o.label}</span>
                </button>
              ))}
            </div>
          </>
        )

      case 'feeling':
        return (
          <>
            <h2 className="quiz-q">Qual sentimento essa música deve transmitir?</h2>
            <p className="quiz-hint">Escolha a opção que mais combina.</p>
            <div className="voice-grid quiz-feeling-grid" role="radiogroup" aria-label="Sentimento da música">
              {FEELINGS.map(f => (
                <button key={f.label} type="button"
                  className={`voice-card${feeling === f.label ? ' selected' : ''}`}
                  role="radio" aria-checked={feeling === f.label}
                  onClick={() => { setFeeling(f.label); advance() }}>
                  <span className="voice-icon" aria-hidden="true">{f.icon}</span>
                  <span className="voice-label">{f.label}</span>
                </button>
              ))}
            </div>
          </>
        )

      case 'genre': {
        const showInfantil = minChildAge <= 14
        const topLabels = showInfantil ? ['Infantil', ...TOP_GENRE_LABELS] : TOP_GENRE_LABELS
        const allList = showInfantil ? [INFANTIL_GENRE, ...GENRES.filter(x => x.label !== 'Infantil')] : GENRES
        const top = topLabels.map(l => allList.find(g => g.label === l)).filter(Boolean)
        const rest = allList.filter(g => !topLabels.includes(g.label))
        const shown = genreExpanded ? [...top, ...rest] : top
        return (
          <>
            <h2 className="quiz-q">Qual estilo de música?</h2>
            <span className="chip" style={{ marginBottom: 12, display: 'inline-block' }}>Mais pedidos</span>
            <div className="genre-grid" role="radiogroup">
              {shown.map(gi => (
                <button key={gi.label} type="button" className={`genre-card${genre === gi.label ? ' selected' : ''}`}
                  role="radio" aria-checked={genre === gi.label}
                  onClick={() => { setGenre(gi.label); advance() }}>
                  <span className="genre-icon" aria-hidden="true">{gi.icon}</span>
                  <span className="genre-label">{gi.label}</span>
                </button>
              ))}
            </div>
            <button type="button" className="quiz-rel-more" onClick={() => setGenreExpanded(v => !v)}
              aria-expanded={genreExpanded}>
              {genreExpanded ? 'Ver menos estilos ▲' : 'Ver mais estilos ▼'}
            </button>
          </>
        )
      }

      case 'mood':
        return (
          <>
            <h2 className="quiz-q">Qual clima da música?</h2>
            <div className="quiz-chips" role="radiogroup">
              {MOODS.map(m => (
                <button key={m.label} type="button" className={`pill quiz-mood${mood === m.label ? ' selected' : ''}`}
                  role="radio" aria-checked={mood === m.label}
                  onClick={() => { setMood(m.label); advance() }}>
                  <span aria-hidden="true">{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
          </>
        )

      case 'voice':
        return (
          <>
            <h2 className="quiz-q">Voz de quem vai cantar a música?</h2>
            <div className="voice-grid" role="radiogroup">
              {VOICES.map(v => (
                <button key={v.label} type="button" className={`voice-card${voice === v.label ? ' selected' : ''}`}
                  role="radio" aria-checked={voice === v.label}
                  onClick={() => { setVoice(v.label); advance() }}>
                  <span className="voice-icon" aria-hidden="true">{v.icon}</span>
                  <span className="voice-label">{v.label}</span>
                </button>
              ))}
            </div>
          </>
        )

      case 'contact': {
        const clientErr = validateFullName(clientName)
        return (
          <>
            <h2 className="quiz-q">Falta pouquinho! Quem é você?</h2>
            <p className="quiz-hint">A gente te avisa aqui no site quando sua música ficar pronta.</p>
            <label className="quiz-label">Seu nome e sobrenome</label>
            <div className="input-wrapper">
              <span className="input-icon" aria-hidden="true">👤</span>
              <input className="input-text has-icon" value={clientName} onChange={e => setClientName(e.target.value)}
                placeholder="Ex: Maria Silva" aria-invalid={!!clientErr} />
            </div>
            {clientErr && <p className="quiz-hint" style={{ marginTop: 8, color: 'var(--c-danger)' }} role="alert">{clientErr}</p>}
            <label className="quiz-label" style={{ marginTop: 14 }}>Seu WhatsApp</label>
            <div className="input-wrapper">
              <span className="input-icon" aria-hidden="true">📱</span>
              <input className="input-text has-icon" value={phone} onChange={e => setPhone(phoneMask(e.target.value))}
                type="tel" placeholder="11 9 9999-9999" maxLength={16} />
            </div>
          </>
        )
      }

      case 'review':
        return <ReviewScreen rel={rel} honoree={honoree} count={count} children={children}
          traits={traits} open1={open1} open2={open2} exTone={exTone} team={team}
          occasion={occasion} feeling={feeling} genre={genre} mood={mood} voice={voice} clientName={clientName} phone={phone}
          onJumpTo={(targetType) => {
            const target = screens.findIndex(s => s.type === targetType)
            if (target >= 0) {
              // marca que o próximo "Continuar" volta direto pra review
              returnToReviewRef.current = true
              setSi(target)
            }
          }} />

      default:
        return null
    }
  }

  const isLast = si === total - 1
  const hideNextHint = screen?.type === 'relationship'

  // CTA final: "Criar prévia grátis" — induz conversão removendo barreiras
  // ("prévia" = sem compromisso · "grátis" = sem custo). Acima do "Continuar"
  // padrão usado nos steps intermediários.
  const nextLabel = audioState.transcribing
    ? <span className="spinner" />
    : audioState.recording
      ? '⏹ Enviar áudio'
      : isLast ? '🎵 Criar prévia grátis' : 'Continuar →'

  const progressPct = Math.round(((si + 1) / total) * 100)

  return (
    <div className="quiz-card" id="quizCard">
      <div className="quiz-top">
        <div className="quiz-top-meta">
          {sectionLabel && <span className="quiz-section">{sectionLabel}</span>}
        </div>
        <div className="quiz-progress-track"
          role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={progressPct} aria-label="Progresso do quiz">
          <div className="quiz-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="quiz-step-count">{si + 1} / {total}</div>
      </div>

      {showResumeBanner && (
        <div className="quiz-resume-banner" role="status">
          <span>Achei um rascunho seu — continuamos de onde parou?</span>
          <div className="quiz-resume-actions">
            <button type="button" className="quiz-resume-keep" onClick={() => setShowResumeBanner(false)}>Continuar</button>
            <button type="button" className="quiz-resume-discard" onClick={resetEverything}>Começar de novo</button>
          </div>
        </div>
      )}

      <div className="quiz-screen">
        {renderScreen()}
      </div>

      {advancing && (
        <div
          aria-hidden="true"
          onClick={(e) => { e.stopPropagation(); e.preventDefault() }}
          onTouchStart={(e) => { e.stopPropagation() }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'transparent', cursor: 'wait', touchAction: 'none' }}
        />
      )}

      <div className="quiz-foot">
        {!hideNextHint && (
          <div className="quiz-nav">
            {si > 0 && <button type="button" className="quiz-back" onClick={() => go(-1)}>← Voltar</button>}
            <button type="button" className="btn-primary quiz-next"
              disabled={(!canNext() && !audioState.recording && !audioState.transcribing) || loading || audioState.transcribing}
              onClick={handleNext}>
              {loading ? <span className="spinner" /> : nextLabel}
            </button>
          </div>
        )}
        {screen?.type === 'relationship' && (
          <button type="button" className="quiz-chat-link" onClick={onChat}>prefiro conversar 💬</button>
        )}
      </div>
    </div>
  )
}

/* ─── Subtelas separadas pra usar useRotatingPlaceholder de forma limpa ───
   Hint agora vem como { msg, severity } pra colorir conforme distância do mínimo:
   'danger' (vermelho com ⚠️) quando < 50% do mínimo, 'warning' (terracota) acima. */
function OpenHint({ hint }) {
  if (!hint) return null
  const isDanger = hint.severity === 'danger'
  return (
    <p className="quiz-open-hint" data-severity={hint.severity}
      role={isDanger ? 'alert' : 'status'} aria-live="polite">
      <span aria-hidden="true">{isDanger ? '⚠️' : '💜'}</span> {hint.msg}
    </p>
  )
}

function OpenScreen({ q, phKind, val, setter, hint, apiTranscribe, audioStopRef, setAudioState }) {
  const placeholder = useRotatingPlaceholder(phKind)
  return (
    <>
      <h2 className="quiz-q">{q}</h2>
      <AudioField value={val} onChange={setter} apiTranscribe={apiTranscribe}
        placeholder={placeholder}
        exposeStop={audioStopRef} onActiveChange={setAudioState} />
      <OpenHint hint={hint} />
    </>
  )
}

function ChildOpenScreen({ c, nm, hint, setChild, idx, apiTranscribe, audioStopRef, setAudioState }) {
  const placeholder = useRotatingPlaceholder('childOpen')
  return (
    <>
      <h2 className="quiz-q">Conta mais sobre {nm}</h2>
      <p className="quiz-hint">Coisas que ele(a) ama, brincadeira de vocês, um jeitinho especial…</p>
      <AudioField value={c.open || ''} onChange={(v) => setChild(idx, { open: v })} apiTranscribe={apiTranscribe}
        placeholder={placeholder}
        exposeStop={audioStopRef} onActiveChange={setAudioState} />
      <OpenHint hint={hint} />
    </>
  )
}

/* ─── Tela de revisão · resumo do pedido antes de enviar ─── */
function ReviewScreen({ rel, honoree, count, children, traits, open1, open2, exTone, team, occasion, feeling, genre, mood, voice, clientName, phone, onJumpTo }) {
  const honoreeLine = rel?.kind === 'child'
    ? children.slice(0, count).map(c => `${c.name || '—'}${c.age ? ` (${c.age})` : ''}`).filter(Boolean).join(', ')
    : honoree

  // História — pra relação `child`, a história está em children[i].open (1 por filho).
  // Pra outras relações vai em open1 (e às vezes open2, ex.: ex-relação com tom).
  // Truncamos pra caber no card de revisão mantendo o sinal "tem texto".
  const truncate = (s, n = 160) => (s.length > n ? s.slice(0, n).trimEnd() + '…' : s)
  let storyValue = ''
  let storyJumpTo = 'open'
  if (rel?.kind === 'child') {
    const parts = children.slice(0, count)
      .map(c => (c.open || '').trim() ? `${c.name || '—'}: ${(c.open || '').trim()}` : '')
      .filter(Boolean)
    storyValue = parts.length ? truncate(parts.join(' · ')) : ''
    storyJumpTo = 'childOpen'
  } else if (open1) {
    storyValue = truncate(open1 + (open2 ? ' · ' + open2 : ''))
  }

  const Row = ({ label, value, jumpTo }) => (
    <div className="quiz-review-row">
      <div>
        <span className="quiz-review-label">{label}</span>
        <span className="quiz-review-value">{value || '—'}</span>
      </div>
      {jumpTo && <button type="button" className="quiz-review-edit" onClick={() => onJumpTo(jumpTo)}>Editar</button>}
    </div>
  )

  return (
    <>
      <h2 className="quiz-q">Tudo certo?</h2>
      <p className="quiz-hint">Última conferida antes de mandar pro estúdio. Toque em <strong>Editar</strong> em qualquer linha pra mudar.</p>
      <div className="quiz-review">
        <Row label="Pra quem" value={`${rel?.label || '—'} · ${honoreeLine}`} jumpTo="relationship" />
        {rel?.kind !== 'child' && traits.length > 0 && (
          <Row label="Destaques" value={traits.join(', ')} jumpTo="traits" />
        )}
        {exTone && <Row label="Tom" value={exTone} jumpTo="exTone" />}
        {storyValue && <Row label="História" value={storyValue} jumpTo={storyJumpTo} />}
        {team && <Row label="Time" value={team} jumpTo="team" />}
        {occasion && occasion !== 'Sem ocasião específica' && <Row label="Ocasião" value={occasion} jumpTo="occasion" />}
        {feeling && <Row label="Sentimento" value={feeling} jumpTo="feeling" />}
        <Row label="Estilo" value={genre} jumpTo="genre" />
        <Row label="Clima" value={mood} jumpTo="mood" />
        <Row label="Voz" value={voice} jumpTo="voice" />
        <Row label="Contato" value={`${clientName} · ${phone}`} jumpTo="contact" />
      </div>
    </>
  )
}
