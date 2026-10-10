import { cardsOf } from './knowledge.js'
import { NEVER_PUSHED, PASSPORT_ORDER, STARTER } from './verticals.js'

export const XP = { discover: 10, correct: 20, wrong: 5, daily: 50 }
const DAILY_GOAL = { discovered: 2, correct: 1, opened: 1 }

export function initialState() {
  return {
    version: 1,
    xp: 0,
    discovered: {},
    correct: {},
    answered: {},
    cards: [],
    opened: [],
    daily: { date: null, discovered: 0, correct: 0, opened: 0, done: false },
    streak: { count: 0, lastDate: null },
    seenIntro: false,
    visited: [...STARTER], // verticales abiertas en la app: cuentan como Explorador
  }
}

export function markIntroSeen(state) {
  return { ...state, seenIntro: true }
}

const pad = (n) => String(n).padStart(2, '0')
const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Fecha local AAAA-MM-DD (no UTC: completar a las 23:30 en Chile cuenta para ese día). */
export function today(now = new Date()) {
  return format(now)
}

function previousDay(date) {
  const [y, m, d] = date.split('-').map(Number)
  return format(new Date(y, m - 1, d - 1))
}

function dailyFor(state, date) {
  return state.daily.date === date ? state.daily : { date, discovered: 0, correct: 0, opened: 0, done: false }
}

/** Avance de la misión del día (en cero si lo guardado es de otro día). */
export function dailyProgress(state, date) {
  return dailyFor(state, date)
}

/** Aplica un paso de la misión del día; si la completa, suma el bono y actualiza la racha. */
function step(state, date, field) {
  const daily = { ...dailyFor(state, date) }
  if (field) daily[field] += 1
  let { streak, xp } = state
  let bonus = 0
  const complete = Object.entries(DAILY_GOAL).every(([k, goal]) => daily[k] >= goal)
  if (!daily.done && complete) {
    daily.done = true
    bonus = XP.daily
    xp += bonus
    if (streak.lastDate !== date) {
      streak = { count: streak.lastDate === previousDay(date) ? streak.count + 1 : 1, lastDate: date }
    }
  }
  return { state: { ...state, daily, streak, xp }, bonus }
}

/** Una tarjeta pasa a lo descubierto de su vertical y al álbum (una sola vez). */
function learn(state, vertical, cardId) {
  const seen = state.discovered[vertical] ?? []
  if (seen.includes(cardId)) return state
  return {
    ...state,
    discovered: { ...state.discovered, [vertical]: [...seen, cardId] },
    cards: state.cards.includes(cardId) ? state.cards : [...state.cards, cardId],
  }
}

/** Ver un dato «¿Sabías que…?»: 10 XP la primera vez, y entra al álbum. */
export function discover(state, vertical, cardId, date) {
  if ((state.discovered[vertical] ?? []).includes(cardId)) return { state, xp: 0, bonus: 0 }
  const next = { ...learn(state, vertical, cardId), xp: state.xp + XP.discover }
  const { state: out, bonus } = step(next, date, 'discovered')
  return { state: out, xp: XP.discover + bonus, bonus }
}

/** Responder: 20 XP si acierta y 5 si no. Acertar una pregunta de conocimiento (`cardId`) la suma al álbum. */
export function answer(state, vertical, isCorrect, date, cardId) {
  const gained = isCorrect ? XP.correct : XP.wrong
  const learned = isCorrect && cardId ? learn(state, vertical, cardId) : state
  const next = {
    ...learned,
    xp: state.xp + gained,
    answered: { ...state.answered, [vertical]: (state.answered[vertical] ?? 0) + 1 },
    correct: isCorrect ? { ...state.correct, [vertical]: (state.correct[vertical] ?? 0) + 1 } : state.correct,
  }
  const { state: out, bonus } = step(next, date, isCorrect ? 'correct' : null)
  return { state: out, xp: gained + bonus, bonus }
}

/** Abrir una carta ya desbloqueada cuenta para la misión del día; una bloqueada no hace nada. */
export function openCard(state, cardId, date) {
  if (!state.cards.includes(cardId)) return { state, xp: 0, bonus: 0 }
  const next = state.opened.includes(cardId) ? state : { ...state, opened: [...state.opened, cardId] }
  const { state: out, bonus } = step(next, date, 'opened')
  return { state: out, xp: bonus, bonus }
}

export function explorerLevel(xp) {
  return 1 + Math.floor(xp / 100)
}

/** Niveles de explorador alcanzados al pasar de `before` a `after` XP (para celebrarlos). */
export function levelsGained(before, after) {
  const from = explorerLevel(before)
  const to = explorerLevel(after)
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i + 1)
}

export const LEVELS = ['ninguno', 'explorador', 'conocedor', 'experto']

/** Nivel de una vertical por sus tarjetas descubiertas (datos vistos y preguntas acertadas) y sus aciertos. */
export function verticalLevel(state, vertical) {
  const total = cardsOf(vertical).length
  const found = state.discovered[vertical]?.length ?? 0
  const correct = state.correct[vertical] ?? 0
  if (found >= total && correct >= 8) return 'experto'
  if (found >= Math.ceil(total / 2) && correct >= 3) return 'conocedor'
  if (found >= 1 || state.visited?.includes(vertical)) return 'explorador'
  return 'ninguno'
}

export function conoceRappi(state) {
  return PASSPORT_ORDER.every((v) => LEVELS.indexOf(verticalLevel(state, v)) >= LEVELS.indexOf('conocedor'))
}

/** Racha vigente: se mantiene si la última misión completa fue hoy o ayer. */
export function currentStreak(state, date) {
  const { count, lastDate } = state.streak
  return lastDate === date || lastDate === previousDay(date) ? count : 0
}

/** La vertical con menos avance (tarjetas descubiertas sobre el total); empate, la primera del pasaporte. */
export function nextVertical(state) {
  const ratio = (v) => (state.discovered[v]?.length ?? 0) / cardsOf(v).length
  return PASSPORT_ORDER.reduce((best, v) => (ratio(v) < ratio(best) ? v : best))
}

/** Abrir la vertical en la app la sella (Explorador). `isNew`: no tenía sello. */
export function visit(state, vertical) {
  const isNew = verticalLevel(state, vertical) === 'ninguno'
  if (state.visited?.includes(vertical)) return { state, isNew }
  return { state: { ...state, visited: [...(state.visited ?? []), vertical] }, isNew }
}

/** Verticales con sello (Explorador o más), en el orden del pasaporte. */
export function stampedVerticals(state) {
  return PASSPORT_ORDER.filter((v) => verticalLevel(state, v) !== 'ninguno')
}

/**
 * La ronda que se ofrece mientras llega un pedido: la primera vertical sin sello; si todas tienen, la de menor nivel
 * (en empate, la primera). Nunca una de NEVER_PUSHED; `null` si todas están en Experto.
 */
export function waitingRoundVertical(state) {
  const candidates = PASSPORT_ORDER.filter((v) => !NEVER_PUSHED.has(v))
  const rank = (v) => LEVELS.indexOf(verticalLevel(state, v))
  const best = candidates.reduce((min, v) => (rank(v) < rank(min) ? v : min))
  if (verticalLevel(state, best) === 'experto') return null
  return { vertical: best, isNew: verticalLevel(state, best) === 'ninguno' }
}
