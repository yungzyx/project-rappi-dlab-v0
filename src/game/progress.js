import { DATA, conceptsOf } from './data.js'
import { factsOf } from './facts.js'
import { pickOne, rng } from './rng.js'

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
  }
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

export function discover(state, vertical, conceptId, date) {
  const seen = state.discovered[vertical] ?? []
  if (seen.includes(conceptId)) return { state, xp: 0, bonus: 0 }
  const next = {
    ...state,
    xp: state.xp + XP.discover,
    discovered: { ...state.discovered, [vertical]: [...seen, conceptId] },
  }
  const { state: out, bonus } = step(next, date, 'discovered')
  return { state: out, xp: XP.discover + bonus, bonus }
}

function nextCard(state, vertical) {
  const locked = (f) => !state.cards.includes(f.id)
  return factsOf(vertical).find(locked) ?? factsOf(null).find(locked) ?? null
}

export function answer(state, vertical, isCorrect, date) {
  const gained = isCorrect ? XP.correct : XP.wrong
  const card = nextCard(state, vertical)
  const next = {
    ...state,
    xp: state.xp + gained,
    answered: { ...state.answered, [vertical]: (state.answered[vertical] ?? 0) + 1 },
    correct: isCorrect ? { ...state.correct, [vertical]: (state.correct[vertical] ?? 0) + 1 } : state.correct,
    cards: card ? [...state.cards, card.id] : state.cards,
  }
  const { state: out, bonus } = step(next, date, isCorrect ? 'correct' : null)
  return { state: out, xp: gained + bonus, bonus, card }
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

export const LEVELS = ['ninguno', 'explorador', 'conocedor', 'experto']

export function verticalLevel(state, vertical) {
  const total = conceptsOf(vertical).length
  const found = state.discovered[vertical]?.length ?? 0
  const correct = state.correct[vertical] ?? 0
  if (found >= total && correct >= 8) return 'experto'
  if (found >= Math.ceil(total / 2) && correct >= 3) return 'conocedor'
  if (found >= 1) return 'explorador'
  return 'ninguno'
}

export function conoceRappi(state) {
  return DATA.order.every((v) => LEVELS.indexOf(verticalLevel(state, v)) >= LEVELS.indexOf('conocedor'))
}

/** Racha vigente: se mantiene si la última misión completa fue hoy o ayer. */
export function currentStreak(state, date) {
  const { count, lastDate } = state.streak
  return lastDate === date || lastDate === previousDay(date) ? count : 0
}

/** Vertical destacada del día: la misma para todos esa fecha. */
export function dailyVertical(date) {
  return pickOne(rng(`dia|${date}`), DATA.order)
}

/** La vertical con menos avance (conceptos descubiertos sobre el total); empate, la primera del mapa. */
export function nextVertical(state) {
  const ratio = (v) => (state.discovered[v]?.length ?? 0) / conceptsOf(v).length
  return DATA.order.reduce((best, v) => (ratio(v) < ratio(best) ? v : best))
}
