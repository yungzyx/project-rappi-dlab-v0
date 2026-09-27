import AddButton from './AddButton'
import './product-row.css'

/** Producto en formato lista (página de tienda y resultados del buscador). */
export default function ProductRow({ product, showStore = false }) {
  return (
    <li className="product-row">
      <span className="product-row-text">
        <strong>{product.name}</strong>
        {showStore && <span className="product-row-store">{product.store}</span>}
        <span className="product-row-prices">
          <b>{product.price}</b>
          {product.before && <s>{product.before}</s>}
          {product.discount && <span className="product-row-pct">{product.discount}</span>}
        </span>
      </span>
      <span className="product-row-media">
        <img src={product.img} alt="" />
        <AddButton product={product} className="add-button--row" />
      </span>
    </li>
  )
}
