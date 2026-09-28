/**
 * Titular numérico de una sección: la cifra que hay que mirar primero, en grande, con su unidad y una línea de
 * contexto. Va en la cabecera de la sección, a la derecha del título (estilo informe).
 */
export function Headline({ value, unit, context, tone = 'ink', size = 'display' }) {
  return (
    <p className={`headline headline--${tone} headline--${size}`}>
      <strong className="num">{value}</strong>
      {unit && <span className="headline-unit">{unit}</span>}
      {context && <span className="headline-context">{context}</span>}
    </p>
  )
}
