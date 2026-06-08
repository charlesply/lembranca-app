// Gera filename amigavel pra download de midia (mp3/mp4).
// Remove acentos, caracteres especiais e espacos pra ASCII puro.
// Ex: safeFilename('João da Silva', 'mp3', 'v1') -> 'Para_Joao_da_Silva_v1.mp3'
export function safeFilename(name, ext, suffix) {
  const clean = String(name || 'musica')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40)
  return `Para_${clean || 'voce'}${suffix ? '_' + suffix : ''}.${ext}`
}
