import { Async } from '../../components/Async.jsx'
import { ActionList } from './ActionList.jsx'
import { KpiStrip } from './KpiStrip.jsx'
import { WeeklyCharts } from './WeeklyCharts.jsx'
import './summary.css'

export function SummaryView({ source, onNavigate }) {
  return (
    <div className="view">
      <section className="section" aria-labelledby="que-hacer">
        <Async>
          <ActionList source={source} onNavigate={onNavigate} />
        </Async>
      </section>

      <section className="section" aria-labelledby="indicadores">
        <div className="section-head">
          <h2 id="indicadores">Indicadores al corte</h2>
          <p>Cada uno con su definición y la ventana de tiempo que usa la API.</p>
        </div>
        <Async>
          <KpiStrip source={source} />
        </Async>
      </section>

      <section className="section" aria-labelledby="semanal">
        <div className="section-head">
          <h2 id="semanal">Evolución semanal</h2>
          <p>Rojo solo si empeora. La semana en curso va punteada y no entra en la comparación.</p>
        </div>
        <Async>
          <WeeklyCharts source={source} />
        </Async>
      </section>
    </div>
  )
}
