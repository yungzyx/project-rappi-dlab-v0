import { Async } from '../../components/Async.jsx'
import { ProvenanceBadge } from '../../components/ProvenanceBadge.jsx'
import { useAnalyticsWithOrigin } from '../../lib/useAnalytics.js'
import { GameUsage } from './GameUsage.jsx'
import { OffersByMoment } from './OffersByMoment.jsx'
import { SavedNote, SourceNote } from './SourceNote.jsx'
import { UnmetSearches } from './UnmetSearches.jsx'
import './mvp.css'

function Offers({ source }) {
  const { data, saved } = useAnalyticsWithOrigin('offers', source)
  return (
    <>
      <SavedNote saved={saved} />
      <OffersByMoment data={data} source={source} />
    </>
  )
}

function Game({ source }) {
  const { data, saved } = useAnalyticsWithOrigin('game', source)
  return (
    <>
      <SavedNote saved={saved} />
      <GameUsage data={data} source={source} />
    </>
  )
}

function Unmet({ source }) {
  const { data, saved } = useAnalyticsWithOrigin('unmet', source)
  return (
    <>
      <SavedNote saved={saved} />
      <UnmetSearches data={data} />
    </>
  )
}

export function MvpUsageView({ source }) {
  return (
    <div className="view">
      <section className="section" aria-labelledby="ofertas">
        <div className="section-head">
          <h2 id="ofertas">Ofertas del agente por momento</h2>
          <p>
            Aceptada: la oferta se agregó al carro. El momento es dónde se hizo: en un plan, con el carro armado, antes
            de pagar, para el próximo pedido, cuando una búsqueda no encontró nada, para probar otro vertical, al
            preguntarle al agente o en «Para ti». Los servicios sin catálogo tienen su propia sección, en «Entre verticales».
          </p>
          <ProvenanceBadge kind={source} />
        </div>
        <div className="block enter">
          <SourceNote source={source} />
          <Async>
            <Offers source={source} />
          </Async>
        </div>
      </section>

      <section className="section" aria-labelledby="juego">
        <div className="section-head">
          <h2 id="juego">Juego</h2>
          <p>
            El juego de verticales de la app: rondas terminadas, tarjetas descubiertas y estrellas promedio, en total y
            por vertical del juego.
          </p>
          <ProvenanceBadge kind={source} />
        </div>
        <div className="block enter">
          <SourceNote source={source} />
          <Async>
            <Game source={source} />
          </Async>
        </div>
      </section>

      <section className="section" aria-labelledby="sin-resultado">
        <div className="section-head">
          <h2 id="sin-resultado">Búsquedas sin resultado</h2>
          <p>
            Búsquedas que no encontraron nada, por vertical y concepto reconocido. Es demanda que el catálogo no cubre;
            no se muestra lo que escribió cada persona ni conceptos sensibles.
          </p>
          <ProvenanceBadge kind={source} />
        </div>
        <div className="block enter">
          <SourceNote source={source} />
          <Async>
            <Unmet source={source} />
          </Async>
        </div>
      </section>
    </div>
  )
}
