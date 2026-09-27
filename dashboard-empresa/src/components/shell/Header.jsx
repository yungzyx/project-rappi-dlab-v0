import { formatDate } from '../../lib/format.js'
import { useAnalytics } from '../../lib/useAnalytics.js'
import { Async } from '../Async.jsx'
import { SourceSwitch } from './SourceSwitch.jsx'
import { ThemeToggle } from './ThemeToggle.jsx'

const AS_OF_LABELS = { synthetic: 'último evento simulado', prototype: 'último evento del prototipo' }

function AsOf({ source }) {
  const kpis = useAnalytics('kpis', source)
  return (
    <>
      Datos al <strong className="num">{formatDate(kpis.as_of)}</strong> · {AS_OF_LABELS[source]}
    </>
  )
}

export function Header({ source, onSourceChange }) {
  return (
    <header className="masthead">
      <div className="container masthead-inner">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" />
            <path d="M9 22v-5M16 22V10M23 22v-8" />
          </svg>
          <div>
            <p className="eyebrow">Rappi Chile · uso interno</p>
            <h1>Panel empresa</h1>
          </div>
        </div>
        <div className="masthead-controls">
          <SourceSwitch value={source} onChange={onSourceChange} />
          <ThemeToggle />
        </div>
        <p className="masthead-lede">
          La conducta de compra y lo que la gente pide en búsquedas y chat, convertidos en decisiones para{' '}
          <strong>subir la frecuencia</strong> y <strong>bajar el abandono</strong>.
        </p>
        <div className="masthead-meta">
          <Async fallback={<span>Cargando fecha de corte…</span>}>
            <AsOf source={source} />
          </Async>
        </div>
      </div>
    </header>
  )
}
