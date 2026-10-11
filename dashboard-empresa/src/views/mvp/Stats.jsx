/** Cifras de una sección como lista de definiciones: [{ label, value }]. */
export function Stats({ items }) {
  return (
    <dl className="mvp-stats">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className="num">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
