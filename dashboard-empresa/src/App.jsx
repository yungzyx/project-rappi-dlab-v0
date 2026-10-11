import { useRef, useState } from 'react'
import { ProvenanceBadge } from './components/ProvenanceBadge.jsx'
import { Header } from './components/shell/Header.jsx'
import { ProvenanceBanner } from './components/shell/ProvenanceBanner.jsx'
import { Tabs } from './components/shell/Tabs.jsx'
import { API_URL, refreshSource, retryConnection } from './lib/api.js'
import { useFallbacks } from './lib/useAnalytics.js'
import { useUrlState } from './lib/useUrlState.js'
import { CatalogView } from './views/catalog/CatalogView.jsx'
import { CrossVerticalView } from './views/cross/CrossVerticalView.jsx'
import { FrequencyView } from './views/frequency/FrequencyView.jsx'
import { MvpUsageView } from './views/mvp/MvpUsageView.jsx'
import { OpportunitiesView } from './views/opportunities/OpportunitiesView.jsx'
import { SummaryView } from './views/summary/SummaryView.jsx'

export const VIEWS = [
  { id: 'resumen', label: 'Resumen', View: SummaryView },
  { id: 'oportunidades', label: 'Oportunidades', View: OpportunitiesView },
  { id: 'frecuencia', label: 'Frecuencia y abandono', View: FrequencyView },
  { id: 'verticales', label: 'Entre verticales', View: CrossVerticalView },
  { id: 'catalogo', label: 'Catálogo (real)', View: CatalogView },
  { id: 'mvp', label: 'Uso del MVP', View: MvpUsageView },
]
const VIEW_IDS = VIEWS.map((view) => view.id)

export default function App() {
  const [{ view, source }, setUrlState] = useUrlState(VIEW_IDS)
  const fallbacks = useFallbacks()
  const [reloadKey, setReloadKey] = useState(0)
  const main = useRef(null)
  const tabbar = useRef(null)
  const { View } = VIEWS.find((item) => item.id === view)

  const selectView = (id) => {
    setUrlState((state) => ({ ...state, view: id }))
    // Al cambiar de vista desde abajo, se vuelve al comienzo del contenido (bajo la barra fija).
    const top = main.current.offsetTop - tabbar.current.offsetHeight
    if (window.scrollY > top) window.scrollTo({ top })
  }

  const retry = () => {
    retryConnection()
    setReloadKey((key) => key + 1)
  }

  // Vuelve a pedir la fuente elegida (lo nuevo del prototipo) sin recargar la página ni repetir la otra fuente.
  const refresh = () => {
    refreshSource(source)
    setReloadKey((key) => key + 1)
  }

  return (
    <>
      <Header
        source={source}
        onSourceChange={(next) => setUrlState((state) => ({ ...state, source: next }))}
        onRefresh={refresh}
      />
      <ProvenanceBanner source={source} fallbacks={fallbacks} onRetry={retry} />
      <div className="tabbar" ref={tabbar}>
        <div className="container tabbar-inner">
          <Tabs views={VIEWS} active={view} onSelect={selectView} />
          <span className="tabbar-source">
            <ProvenanceBadge kind={view === 'catalogo' ? 'real' : source} />
          </span>
        </div>
      </div>
      <main ref={main} id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} className="container">
        <View key={`${view}-${source}-${reloadKey}`} source={source} onNavigate={selectView} />
      </main>
      <footer className="site-footer">
        <div className="container">
          <p>
            Definiciones de cada métrica: <span className="mono">docs/diseno-ia.md §5</span>. Datos de la API de rappi-ia
            en <span className="mono">{API_URL}</span>. <a href={`${import.meta.env.BASE_URL}presentacion.html`}>Presentación de la propuesta</a>.
          </p>
          <p>Demo no oficial · prototipo independiente, no afiliado a Rappi.</p>
          <p>
            Usuarios con id seudónimo; las listas por usuario nunca muestran conceptos sensibles. Ninguna palanca se
            escala sin un grupo de control (A/B con holdout).
          </p>
        </div>
      </footer>
    </>
  )
}
