import { useAssistant } from '../state/AssistantContext'
import { useDemo } from '../state/DemoContext'

/**
 * Abre el buscador que corresponde al modo de demo: en el prototipo final, el de Bigotes; en «Rappi hoy», el plano.
 * `vertical`: la de la pantalla desde la que se abre (el embudo del panel se mide por vertical).
 */
export function useOpenSearch(push) {
  const assistant = useAssistant()
  const demo = useDemo()
  return (vertical) => {
    if (demo.isFinal) assistant.open(vertical ? { vertical } : {})
    else push('search', vertical ? { vertical } : {})
  }
}
