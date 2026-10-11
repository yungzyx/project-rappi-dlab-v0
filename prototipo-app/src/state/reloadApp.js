/**
 * Tras «Borrar mis datos» / «Olvidar» la app arranca de cero en la Home: el carro, los favoritos, Loyalty, la dirección y
 * la conversación con el agente viven en memoria, y recargar es la forma segura de que ninguno sobreviva.
 * (`#/home` primero: así la recarga no vuelve a la pantalla en que estaba, ni a su historial.)
 */
export function reloadToHome() {
  window.location.replace(`${window.location.pathname}${window.location.search}#/home`)
  window.location.reload()
}
