// Promise que resolve apos N ms. Util pra delays em fluxos sequenciais
// (botSay com pausa entre mensagens, polling, etc).
export const sleep = (ms) => new Promise(r => setTimeout(r, ms))
