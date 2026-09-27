/** Tarjeta de un gráfico o tabla: título, bajada, insignia de procedencia y contenido. */
export function Card({ title, subtitle, badge, index = 0, className = '', children }) {
  return (
    <section className={`card enter ${className}`} style={{ '--i': index }} aria-label={title}>
      <header className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {badge}
      </header>
      {children}
    </section>
  )
}
