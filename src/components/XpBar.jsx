import './xp-bar.css'

/** Barra de experiencia dentro del nivel actual (cada nivel son 100 XP). */
export default function XpBar({ xp }) {
  const inLevel = xp % 100
  return (
    <div className="xp-bar" role="progressbar" aria-label="Experiencia del nivel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={inLevel}>
      <span style={{ transform: `scaleX(${inLevel / 100})` }} />
    </div>
  )
}
