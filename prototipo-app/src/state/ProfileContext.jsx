import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { tagsOf } from '../assistant/tags'

// Lo que el asistente "aprende": puntaje por tema según lo que el usuario agrega, abre y pregunta.
// Se guarda en este navegador para que la demo recuerde entre recargas.
const STORAGE_KEY = 'rappi-proto-profile'
export const WEIGHTS = { cart: 3, store: 2, query: 1 }

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

function save(scores) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores))
  } catch {
    // Sin almacenamiento (modo privado): el perfil vive solo en memoria.
  }
}

const ProfileContext = createContext(null)

export function ProfileProvider({ children }) {
  const [scores, setScores] = useState(load)

  /** Suma `weight` a los temas dados (p. ej. los de una ocasión como "asado"). */
  const trackTags = useCallback((tags, weight) => {
    if (tags.length === 0) return
    setScores((prev) => {
      const next = { ...prev }
      tags.forEach((tag) => {
        next[tag] = (next[tag] ?? 0) + weight
      })
      save(next)
      return next
    })
  }, [])

  /** Suma `weight` a los temas que aparecen en `text` (nombre de producto, tienda o frase). */
  const track = useCallback((text, weight) => trackTags(tagsOf(text), weight), [trackTags])

  const value = useMemo(() => {
    const top = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
    return {
      scores,
      top,
      track,
      trackTags,
      reset: () => {
        save({})
        setScores({})
      },
    }
  }, [scores, track, trackTags])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export const useProfile = () => useContext(ProfileContext)
