import { useState } from 'react'
import Sheet from '../../components/Sheet'
import { useToast } from '../../components/Toast'
import { ChevronLeft, ChevronRight } from '../../components/Icons'
import { useLoyalty } from '../../state/LoyaltyContext'
import latam from '../../assets/v/loy-latam.webp'
import marriott from '../../assets/v/loy-marriott.webp'
import iberia from '../../assets/v/loy-iberia.webp'
import banner from '../../assets/v/loy-banner.webp'
import './loyalty.css'

const PROGRAMS = [
  { id: 'latam', name: 'LATAM Pass', logo: latam, unit: 'millas' },
  { id: 'marriott', name: 'Marriott Bonvoy', logo: marriott, unit: 'puntos' },
  { id: 'iberia', name: 'Iberia Club', logo: iberia, unit: 'Avios' },
]

/**
 * Loyalty (captura IMG_9129). Funcionalidad agregada: vincular un programa y cambiarlo;
 * el vinculado pasa a "Tu programa" y sale de "Otros programas disponibles".
 */
export default function LoyaltyScreen({ back }) {
  const toast = useToast()
  const loyalty = useLoyalty()
  const [pendingId, setPendingId] = useState(null)
  const active = PROGRAMS.find((program) => program.id === loyalty.activeId)
  const pending = PROGRAMS.find((program) => program.id === pendingId)
  const others = PROGRAMS.filter((program) => program.id !== loyalty.activeId)

  const confirm = () => {
    loyalty.link(pending.id)
    setPendingId(null)
    toast(`Acumulando ${pending.unit} en ${pending.name}`)
  }

  return (
    <div className="screen loyalty">
      <header className="loyalty-header">
        <button type="button" className="loyalty-back tap" aria-label="Volver" onClick={back}>
          <ChevronLeft size={20} />
        </button>
        <h1>Loyalty</h1>
      </header>

      <h2 className="loyalty-title">Elige un programa</h2>
      <p className="loyalty-text">
        Acumula puntos/millas en un (1) programa siendo PRO. Selecciona &quot;cambiar&quot; cuando desees acumular en otro
        programa.
        <br />
        ¡Canjea a créditos en cuantos programas quieras!
      </p>

      {active && (
        <>
          <h3 className="loyalty-subtitle">Tu programa</h3>
          <div className="loyalty-active">
            <img src={active.logo} alt="" />
            <span>
              <strong>{active.name}</strong>
              <span className="loyalty-badge">Acumulando {active.unit}</span>
            </span>
            <button type="button" className="loyalty-change" onClick={loyalty.unlink}>
              Desvincular
            </button>
          </div>
        </>
      )}

      <h3 className="loyalty-subtitle">Otros programas disponibles</h3>
      <ul className="loyalty-list">
        {others.map((program) => (
          <li key={program.id}>
            <button type="button" className="loyalty-row" onClick={() => setPendingId(program.id)}>
              <img src={program.logo} alt="" />
              <strong>{program.name}</strong>
              <ChevronRight size={20} />
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="loyalty-banner tap" onClick={() => setPendingId('iberia')}>
        <img src={banner} alt="Europa te espera: vincula tu cuenta Iberia Club" />
      </button>
      <button type="button" className="loyalty-terms" onClick={() => toast()}>
        Ver términos y condiciones
      </button>

      <Sheet open={Boolean(pending)} onClose={() => setPendingId(null)} title={pending && `Vincular ${pending.name}`}>
        {pending && (
          <div className="loyalty-sheet">
            <img src={pending.logo} alt="" />
            <p>
              {active
                ? `Dejarás de acumular en ${active.name} y empezarás a acumular ${pending.unit} en ${pending.name}.`
                : `Acumula ${pending.unit} en cada pedido siendo Rappi Pro.`}
            </p>
            <button type="button" className="loyalty-sheet-primary tap" onClick={confirm}>
              {active ? 'Cambiar programa' : 'Vincular cuenta'}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  )
}
