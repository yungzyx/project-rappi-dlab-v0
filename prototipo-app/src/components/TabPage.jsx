import { useRef } from 'react'
import { useScrollState } from '../hooks/useScrollState'
import BackToTop from './BackToTop'
import './tab-page.css'

const COLLAPSE_AT_PX = 70
const BACK_TO_TOP_FROM_PX = 600
const BACK_TO_TOP_Y = 141

/**
 * Pestañas con título grande de color (Deals, My Favorites): al bajar, el título pasa a un
 * encabezado compacto translúcido; al volver a subir aparece "Back to top".
 */
export default function TabPage({ title, color, action, className = '', children }) {
  const ref = useRef(null)
  const [{ top, goingUp }, onScroll] = useScrollState()
  const isCollapsed = top > COLLAPSE_AT_PX

  return (
    <>
      <header className={isCollapsed ? 'tab-compact is-visible' : 'tab-compact'} aria-hidden={!isCollapsed}>
        <h2 style={{ color }}>{title}</h2>
      </header>
      {action && <div className="tab-action">{action}</div>}
      <BackToTop
        visible={goingUp && top > BACK_TO_TOP_FROM_PX}
        top={BACK_TO_TOP_Y}
        onClick={() => ref.current.scrollTo({ top: 0, behavior: 'smooth' })}
      />
      <div ref={ref} className={`screen tab-page ${className}`} onScroll={onScroll}>
        <h1 className="tab-title" style={{ color }}>
          {title}
        </h1>
        {children}
      </div>
    </>
  )
}
