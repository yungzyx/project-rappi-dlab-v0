/**
 * Titular numérico de una sección: la cifra que hay que mirar primero, en grande, con su unidad y una línea de
 * contexto. Va en la cabecera de la sección, a la derecha del título (estilo informe).
 */
export function Headline({ value, unit, context, tone = 'ink' }) {
  return (
    <p className={`headline headline--${tone}`}>
      <strong className="num">{value}</strong>
      {unit && <span className="headline-unit">{unit}</span>}
      {context && <span className="headline-context">{context}</span>}
    </p>
  )
}
