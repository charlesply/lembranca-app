/* ══════════════════════════════════════════════════════════════
   QUIZ CONFIG — dados das perguntas do quiz personalizado.
   O motor (Quiz.jsx) renderiza as telas a partir daqui.
   Tudo data-driven: relação primeiro, depois ramos específicos.
══════════════════════════════════════════════════════════════ */

// Estilos / climas / vozes — reaproveitados do App (mantidos aqui pra o config
// ser auto-contido; iguais aos do App.jsx).
export const GENRES = [
  { label: 'Sertanejo', icon: '🎵' },
  { label: 'Sertanejo Raiz', icon: '🎶' },
  { label: 'Gospel', icon: '📖' },
  { label: 'Pagode', icon: '🪘' },
  { label: 'MPB', icon: '🎙️' },
  { label: 'Trap', icon: '🔊' },
  { label: 'Samba', icon: '🥁' },
  { label: 'Acústico', icon: '🎸' },
  { label: 'Pop', icon: '⭐' },
  { label: 'Rock', icon: '🎸' },
  { label: 'Rap', icon: '🎤' },
  { label: 'Hip-Hop', icon: '🎧' },
  { label: 'RnB', icon: '💜' },
  { label: 'Jazz', icon: '🎷' },
  { label: 'Clássico', icon: '🎻' },
  { label: 'Reggae', icon: '🌿' },
  { label: 'Metal', icon: '⚡' },
  { label: 'Funk', icon: '📻' },
  { label: 'Forró', icon: '🪗' },
  { label: 'Axé', icon: '😄' },
  { label: 'Eletrônica', icon: '💿' },
]

// "Mais pedidos" — aparecem em destaque no topo da tela de estilo musical;
// os demais ficam atrás de um expander.
export const TOP_GENRE_LABELS = ['Sertanejo', 'Sertanejo Raiz', 'Gospel', 'Pagode', 'MPB', 'Trap']

// Estilo "Infantil" — só aparece (como 1ª opção) quando o homenageado tem
// 14 anos ou menos. Fora desse caso, não consta no menu.
export const INFANTIL_GENRE = { label: 'Infantil', icon: '🧸' }

export const MOODS = [
  { label: 'Romântico', icon: '💗' },
  { label: 'Feliz', icon: '😄' },
  { label: 'Animado', icon: '🎉' },
  { label: 'Triste', icon: '🥲' },
  { label: 'Épico', icon: '🔥' },
  { label: 'Relaxante', icon: '🌙' },
  { label: 'Adoração', icon: '🙏' },
]

// Vozes — somente Masculino e Feminino (sem "deixar o maestro decidir").
export const VOICES = [
  { label: 'Masculino', icon: '👨' },
  { label: 'Feminino', icon: '👩' },
]

// Times de futebol (chips) — usado SÓ no ramo de crianças (e com idade ≤ 16).
export const TEAMS = ['Corinthians', 'Palmeiras', 'São Paulo', 'Santos', 'Flamengo', 'Vasco', 'Botafogo', 'Fluminense']

/* ── RELAÇÕES ──────────────────────────────────────────────────
   kind: 'child' (fluxo de quantidade + por-criança) | 'romantic' | 'ex'
         | 'parent' | 'sibling' | 'grandparent' | 'friend'

   Para 'child', a relação é unificada (ex: "Filho(a)"). O gênero
   de cada homenageado é coletado depois, criança por criança, na
   tela de `childInfo`. Por isso `gender` aqui é null e usamos
   `posesByGender` pra montar a story ("meu filho" / "minha filha").

   Para os demais kinds (romantic/parent/sibling/etc) o gênero é
   parte da própria escolha (Esposo vs Esposa) e fica no objeto.

   team: oferece a pergunta de time? (somente 'child'; pra adulto, false)
   plural: variante plural? (Filhos(as)/Netos(as)…). Quando true,
           o contador inicia em 2.
─────────────────────────────────────────────────────────────── */
export const RELATIONSHIPS = [
  // CHILD-TYPE · singulares (com sufixo (a) — gênero coletado por criança)
  { id: 'filho_a',    label: 'Filho(a)',    icon: '🧒', gender: null, kind: 'child', team: true, plural: false,
    posesByGender: { m: 'meu filho',    f: 'minha filha' } },
  { id: 'neto_a',     label: 'Neto(a)',     icon: '🧒', gender: null, kind: 'child', team: true, plural: false,
    posesByGender: { m: 'meu neto',     f: 'minha neta' } },
  { id: 'sobrinho_a', label: 'Sobrinho(a)', icon: '🧒', gender: null, kind: 'child', team: true, plural: false,
    posesByGender: { m: 'meu sobrinho', f: 'minha sobrinha' } },
  { id: 'afilhado_a', label: 'Afilhado(a)', icon: '🧒', gender: null, kind: 'child', team: true, plural: false,
    posesByGender: { m: 'meu afilhado', f: 'minha afilhada' } },

  // CHILD-TYPE · plurais
  { id: 'filhos_as',    label: 'Filhos(as)',    icon: '👨‍👧‍👦', gender: null, kind: 'child', team: true, plural: true,
    posesByGender: { m: 'meu filho',    f: 'minha filha' } },
  { id: 'netos_as',     label: 'Netos(as)',     icon: '👨‍👧‍👦', gender: null, kind: 'child', team: true, plural: true,
    posesByGender: { m: 'meu neto',     f: 'minha neta' } },
  { id: 'sobrinhos_as', label: 'Sobrinhos(as)', icon: '👨‍👧‍👦', gender: null, kind: 'child', team: true, plural: true,
    posesByGender: { m: 'meu sobrinho', f: 'minha sobrinha' } },
  { id: 'afilhados_as', label: 'Afilhados(as)', icon: '👨‍👧‍👦', gender: null, kind: 'child', team: true, plural: true,
    posesByGender: { m: 'meu afilhado', f: 'minha afilhada' } },

  // ROMÂNTICO · sem time
  { id: 'namorado', label: 'Namorado', icon: '💑', gender: 'm', kind: 'romantic', poss: 'meu namorado', team: false },
  { id: 'namorada', label: 'Namorada', icon: '💑', gender: 'f', kind: 'romantic', poss: 'minha namorada', team: false },
  { id: 'esposo',   label: 'Esposo',   icon: '💍', gender: 'm', kind: 'romantic', poss: 'meu esposo',   team: false },
  { id: 'esposa',   label: 'Esposa',   icon: '💍', gender: 'f', kind: 'romantic', poss: 'minha esposa', team: false },
  // Paquera é palavra invariável em PT-BR — quebramos em (ele)/(ela)
  // pra capturar o gênero sem precisar de uma tela extra de seleção.
  { id: 'paquera_m', label: 'Paquera (ele)', icon: '😍', gender: 'm', kind: 'romantic', poss: 'meu paquera',  team: false },
  { id: 'paquera_f', label: 'Paquera (ela)', icon: '💝', gender: 'f', kind: 'romantic', poss: 'minha paquera', team: false },
  { id: 'ex',       label: 'Ex',       icon: '💔', gender: 'n', kind: 'ex',       poss: 'meu(minha) ex', team: false },

  // PAIS · sem time
  { id: 'pai', label: 'Pai', icon: '👨', gender: 'm', kind: 'parent', poss: 'meu pai',   possIn: 'no meu pai',   team: false },
  { id: 'mae', label: 'Mãe', icon: '👩', gender: 'f', kind: 'parent', poss: 'minha mãe', possIn: 'na minha mãe', team: false },

  // IRMÃOS · sem time
  { id: 'irmao', label: 'Irmão', icon: '🧑', gender: 'm', kind: 'sibling', poss: 'meu irmão',  team: false },
  { id: 'irma',  label: 'Irmã',  icon: '👩', gender: 'f', kind: 'sibling', poss: 'minha irmã', team: false },

  // AVÓS · sem time
  { id: 'avo_m', label: 'Avô', icon: '👴', gender: 'm', kind: 'grandparent', poss: 'meu avô',   team: false },
  { id: 'avo_f', label: 'Avó', icon: '👵', gender: 'f', kind: 'grandparent', poss: 'minha avó', team: false },

  // AMIGOS · sem time
  { id: 'amigo', label: 'Amigo', icon: '🤝', gender: 'm', kind: 'friend', poss: 'meu amigo', team: false },
  { id: 'amiga', label: 'Amiga', icon: '🤝', gender: 'f', kind: 'friend', poss: 'minha amiga', team: false },
]

// helper: pronome dele/dela; sufixo de gênero pra traits "Carinhoso(a)"
export const pron = (g) => (g === 'f' ? 'dela' : 'dele')
export const ele = (g) => (g === 'f' ? 'Ela' : 'Ele')
export const eleLower = (g) => (g === 'f' ? 'ela' : 'ele')
// aplica gênero a uma trait com sufixo "(a)": Carinhoso(a) -> Carinhoso / Carinhosa
export const genderTrait = (label, g) => {
  if (!label.includes('(a)')) return label
  return g === 'f' ? label.replace(/o\(a\)/g, 'a').replace('(a)', 'a') : label.replace(/\(a\)/g, '')
}

// listas de "destaques" (traits) por ramo — com sufixo (a) pra gênero
export const TRAITS = {
  child: ['Carinhoso(a)', 'Amoroso(a)', 'Alegre', 'Esperto(a)', 'Divertido(a)', 'Dorminhoco(a)', 'Levado(a)', 'Inteligente', 'Tímido(a)', 'Falante'],
  romantic: ['Carinhoso(a)', 'Companheiro(a)', 'Engraçado(a)', 'Cuidadoso(a)', 'Parceiro(a)', 'Protetor(a)', 'Atencioso(a)'],
  parent: ['Guerreiro(a)', 'Sábio(a)', 'Batalhador(a)', 'Carinhoso(a)', 'Exemplo', 'Trabalhador(a)', 'Protetor(a)'],
  sibling: ['Parceiro(a)', 'Divertido(a)', 'Companheiro(a)', 'Protetor(a)', 'Cúmplice', 'Brigão(ona)', 'Conselheiro(a)'],
  grandparent: ['Carinhoso(a)', 'Sábio(a)', 'Contador(a) de histórias', 'Acolhedor(a)', 'Brincalhão(ona)', 'Exemplo', 'Amoroso(a)'],
  friend: ['Parceiro(a)', 'Engraçado(a)', 'Leal', 'Companheiro(a)', 'Conselheiro(a)', 'Festeiro(a)', 'De confiança'],
}

export const EX_TONES = ['Saudade', 'Reconquista', 'Despedida']

// Ocasião especial — pra qualquer ramo, antes do sentimento.
// Ajuda a IA a colocar a letra no contexto certo (declaração, pedido, etc.).
export const OCCASIONS = [
  { label: 'Pedido de namoro',     icon: '💍' },
  { label: 'Casamento',            icon: '👰' },
  { label: 'Declaração de amor',   icon: '💌' },
  { label: 'Aniversário',          icon: '🎂' },
  { label: 'Saudade',              icon: '🌙' },
  { label: 'Pedido de desculpas',  icon: '🕊️' },
  { label: 'Homenagem',            icon: '🌹' },
  { label: 'Sem ocasião específica', icon: '✨' },
]

// Sentimento que a música deve transmitir — só pra relações adultas
// (namorado, esposo, amigo, pai, mãe, ex, paquera…). Não aparece pra crianças.
export const FEELINGS = [
  { label: 'Amor',         icon: '💜' },
  { label: 'Saudade',      icon: '🌙' },
  { label: 'Romance',      icon: '💗' },
  { label: 'Paixão',       icon: '🔥' },
  { label: 'Cumplicidade', icon: '🤝' },
  { label: 'Perdão',       icon: '🕊️' },
  { label: 'Esperança',    icon: '🌅' },
  { label: 'Emoção',       icon: '✨' },
]
