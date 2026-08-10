// CheckoutCpfBox — caixa de CPF/CNPJ do checkout A/B (variante B).
// Componente COMPARTILHADO: usado no modal do chat (PixPaymentModal), na
// /finalizar (PaymentPage) e em Minhas Músicas — todos passam pelo /api/pay/create,
// que responde `needs_cpf` quando o pedido é variante B. Ao enviar um CPF/CNPJ
// válido, o backend cria a cobrança ASAAS e devolve o PIX.
//
// Identidade visual da Lembrança Cantada (terracota #CC785C + creme). Estilos
// self-contained (prefixo ccb-) pra ficar idêntico em qualquer tela host.
import { useState, useRef, useEffect } from 'react'

const onlyDigits = (s) => (s || '').replace(/\D/g, '')
function maskCpf(v) { v = onlyDigits(v).slice(0, 11); let o = v; if (v.length > 3) o = v.slice(0, 3) + '.' + v.slice(3); if (v.length > 6) o = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6); if (v.length > 9) o = v.slice(0, 3) + '.' + v.slice(3, 6) + '.' + v.slice(6, 9) + '-' + v.slice(9); return o }
function maskCnpj(v) { v = onlyDigits(v).slice(0, 14); let o = v; if (v.length > 2) o = v.slice(0, 2) + '.' + v.slice(2); if (v.length > 5) o = v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5); if (v.length > 8) o = v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5, 8) + '/' + v.slice(8); if (v.length > 12) o = v.slice(0, 2) + '.' + v.slice(2, 5) + '.' + v.slice(5, 8) + '/' + v.slice(8, 12) + '-' + v.slice(12); return o }
function validCpf(cpf) { cpf = onlyDigits(cpf); if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false; let s = 0; for (let i = 0; i < 9; i++) s += +cpf[i] * (10 - i); let d = (s * 10) % 11; if (d === 10) d = 0; if (d !== +cpf[9]) return false; s = 0; for (let i = 0; i < 10; i++) s += +cpf[i] * (11 - i); d = (s * 10) % 11; if (d === 10) d = 0; return d === +cpf[10] }
function validCnpj(c) { c = onlyDigits(c); if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false; const calc = (b) => { let p = b.length - 7, s = 0; for (let i = 0; i < b.length; i++) { s += +b[i] * p--; if (p < 2) p = 9 } const r = s % 11; return r < 2 ? 0 : 11 - r }; return calc(c.slice(0, 12)) === +c[12] && calc(c.slice(0, 13)) === +c[13] }

export default function CheckoutCpfBox({ honoreeName, prefilledEmail, onSubmit, submitting, errorMsg }) {
  const [mode, setMode] = useState('cpf')
  const [doc, setDoc] = useState('')
  const [email, setEmail] = useState(prefilledEmail || '')
  const [docErr, setDocErr] = useState('')
  const [emailErr, setEmailErr] = useState(false)
  const docRef = useRef(null)

  useEffect(() => { const t = setTimeout(() => { try { docRef.current?.focus() } catch (_) {} }, 150); return () => clearTimeout(t) }, [])
  useEffect(() => { if (prefilledEmail && !email) setEmail(prefilledEmail) }, [prefilledEmail]) // eslint-disable-line

  const switchMode = (m) => { setMode(m); setDoc(''); setDocErr(''); setTimeout(() => { try { docRef.current?.focus() } catch (_) {} }, 0) }
  const onDoc = (e) => { setDoc(mode === 'cpf' ? maskCpf(e.target.value) : maskCnpj(e.target.value)); setDocErr('') }
  const submit = () => {
    if (submitting) return
    const emOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    setEmailErr(!emOk)
    const ok = mode === 'cpf' ? validCpf(doc) : validCnpj(doc)
    if (!ok) setDocErr(`${mode === 'cpf' ? 'CPF' : 'CNPJ'} inválido — confere os números 💛`)
    else setDocErr('')
    if (ok && emOk) onSubmit({ email: email.trim(), cpf: onlyDigits(doc), docType: mode })
  }
  const onKey = (e) => { if (e.key === 'Enter') submit() }

  const check = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
  )
  const BULLETS = [
    'Pague 1, leve 2 versões da mesma música',
    'Liberação na hora que o Pix cair',
    'Composição Completa (Letra + Melodia)',
    'Voz Profissional de Estúdio',
    '1 edição grátis',
  ]

  return (
    <div className="ccb-wrap">
      <style>{`
        .ccb-wrap{--ac:#CC785C;--ac2:#b5674d;--ink:#2b1d14;--mut:#7a6354;--faint:#a09080;--line:#f3e5d8;--sect:#fdfaf6;--lsoft:#f6ede2;--err:#b04a30;--ok:#4f7a55;
          font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--ink);text-align:left;}
        .ccb-eyebrow{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--ac);font-weight:800;margin:0 0 6px;}
        .ccb-title{font-size:22px;font-weight:750;margin:0 0 6px;line-height:1.2;letter-spacing:-.01em;}
        .ccb-title em{font-style:normal;color:var(--ac);}
        .ccb-sub{color:var(--mut);font-size:14px;line-height:1.5;margin:0 0 18px;}
        .ccb-plan{background:var(--sect);border:1px solid var(--lsoft);border-radius:16px;padding:16px 15px;margin-bottom:18px;}
        .ccb-plan-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:11px;}
        .ccb-plan-name{font-weight:700;font-size:15.5px;}
        .ccb-plan-price{font-weight:850;font-size:23px;color:var(--ac);letter-spacing:-.02em;white-space:nowrap;}
        .ccb-plan ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;}
        .ccb-plan li{display:flex;gap:9px;align-items:flex-start;font-size:13.5px;color:#57493d;line-height:1.4;}
        .ccb-plan li svg{flex:0 0 auto;margin-top:1px;color:var(--ac);}
        .ccb-fld{display:block;font-size:12.5px;font-weight:700;color:var(--ink);margin:0 0 7px;}
        .ccb-field{margin-bottom:15px;}
        .ccb-dochead{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px;}
        .ccb-toggle{display:inline-flex;background:#f3ece4;border-radius:9px;padding:3px;gap:2px;}
        .ccb-toggle button{border:none;background:transparent;font:inherit;font-size:12px;font-weight:700;color:var(--mut);padding:5px 12px;border-radius:7px;cursor:pointer;transition:.15s;}
        .ccb-toggle button.on{background:var(--ac);color:#fff;box-shadow:0 2px 6px rgba(204,120,92,.25);}
        .ccb-inp{width:100%;padding:14px 15px;border-radius:12px;border:1.5px solid var(--line);background:#fff;font-family:inherit;font-size:16px;color:var(--ink);outline:none;transition:border .15s,box-shadow .15s;box-sizing:border-box;}
        .ccb-inp::placeholder{color:#c3b4a6;}
        .ccb-inp:focus{border-color:var(--ac);box-shadow:0 0 0 3px rgba(204,120,92,.12);}
        .ccb-inp.bad{border-color:var(--err);box-shadow:0 0 0 3px rgba(176,74,48,.10);}
        .ccb-hint{font-size:12px;color:var(--faint);margin:6px 2px 0;line-height:1.4;}
        .ccb-hint.err{color:var(--err);font-weight:600;}
        .ccb-pay{width:100%;margin-top:4px;padding:16px;border:none;border-radius:14px;background:var(--ac);color:#fff;font-family:inherit;font-weight:800;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 8px 20px rgba(204,120,92,.28);transition:filter .15s,transform .06s;}
        .ccb-pay:hover{filter:brightness(1.05);}
        .ccb-pay:active{transform:translateY(1px);}
        .ccb-pay:disabled{opacity:.6;cursor:wait;}
        .ccb-trust{display:flex;align-items:center;justify-content:center;gap:6px;margin:13px 0 0;font-size:12.5px;color:var(--mut);}
        .ccb-foot{margin-top:18px;padding-top:15px;border-top:1px solid var(--line);text-align:center;}
        .ccb-foot .b{font-weight:700;color:var(--mut);font-size:13px;}
        .ccb-foot .c{font-size:12px;color:var(--faint);margin-top:3px;letter-spacing:.02em;}
      `}</style>

      <p className="ccb-eyebrow">Quase lá</p>
      <h2 className="ccb-title">{honoreeName ? <>Música pra <em>{honoreeName}</em></> : 'Sua música'}</h2>
      <p className="ccb-sub">Já preenchemos o que você mandou — falta só o CPF/CNPJ pra gerar o Pix.</p>

      <div className="ccb-plan">
        <div className="ccb-plan-top">
          <span className="ccb-plan-name">Música personalizada</span>
          <span className="ccb-plan-price">R$ 29,90</span>
        </div>
        <ul>{BULLETS.map((b, i) => <li key={i}>{check}<span>{b}</span></li>)}</ul>
      </div>

      <div className="ccb-field">
        <label className="ccb-fld" htmlFor="ccb-email">E-mail</label>
        <input id="ccb-email" className={`ccb-inp${emailErr ? ' bad' : ''}`} type="email" inputMode="email" autoComplete="email"
          value={email} onChange={(e) => { setEmail(e.target.value); setEmailErr(false) }} onKeyDown={onKey} placeholder="seu@email.com" />
        {emailErr
          ? <p className="ccb-hint err">Confere o e-mail — parece incompleto.</p>
          : <p className="ccb-hint">É pra esse e-mail que enviamos a sua música 🎵</p>}
      </div>

      <div className="ccb-field">
        <div className="ccb-dochead">
          <label className="ccb-fld" htmlFor="ccb-doc" style={{ margin: 0 }}>{mode === 'cpf' ? 'CPF' : 'CNPJ'}</label>
          <span className="ccb-toggle" role="tablist">
            <button type="button" className={mode === 'cpf' ? 'on' : ''} onClick={() => switchMode('cpf')}>CPF</button>
            <button type="button" className={mode === 'cnpj' ? 'on' : ''} onClick={() => switchMode('cnpj')}>CNPJ</button>
          </span>
        </div>
        <input id="ccb-doc" ref={docRef} className={`ccb-inp${docErr ? ' bad' : ''}`} inputMode="numeric" autoComplete="off"
          value={doc} onChange={onDoc} onKeyDown={onKey}
          placeholder={mode === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'} />
        {docErr
          ? <p className="ccb-hint err">{docErr}</p>
          : <p className="ccb-hint">Necessário pra gerar a chave PIX</p>}
      </div>

      <button type="button" className="ccb-pay" onClick={submit} disabled={submitting}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
        {submitting ? 'Gerando PIX…' : 'Pagar com PIX'}
      </button>
      {errorMsg && <p className="ccb-hint err" style={{ textAlign: 'center', marginTop: 10 }}>{errorMsg}</p>}

      <p className="ccb-trust">🔒 Pagamento 100% seguro via Pix · liberação imediata</p>
      <div className="ccb-foot">
        <div className="b">Lembrança Cantada</div>
        <div className="c">CNPJ 42.920.135/0001-15</div>
      </div>
    </div>
  )
}
