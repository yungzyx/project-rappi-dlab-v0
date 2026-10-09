import { useAssistant } from '../state/AssistantContext'
import { useDemo } from '../state/DemoContext'

/**
 * Abre el buscador que corresponde al modo de demo: en la Propuesta, el de Bigotes; en «Rappi hoy» y «Bigotes vivo»,
 * el buscador plano. `vertical`: la de la pantalla desde la que se abre (el embudo del panel se mide por vertical).
 */
export function useOpenSearch(push) {
  const assistant = useAssistant()
  const demo = useDemo()
  return (vertical) => {
    if (demo.mode === 'propuesta') assistant.open(vertical ? { vertical } : {})
    else push('search', vertical ? { vertical } : {})
  }
}
