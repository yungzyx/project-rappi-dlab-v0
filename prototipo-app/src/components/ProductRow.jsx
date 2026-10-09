import { useProductSheet } from '../state/ProductSheetContext'
import AddButton from './AddButton'
import './product-row.css'

/** Producto en formato lista (página de tienda y resultados del buscador). Tocarlo abre su hoja; el "+" va aparte. */
export default function ProductRow({ product, showStore = false, showDescription = false }) {
  const sheet = useProductSheet()
  return (
    <li className="product-row">
      <button type="button" className="product-row-main" onClick={() => sheet.open(product)}>
        <span className="product-row-text">
          <strong>{product.name}</strong>
          {showStore && <span className="product-row-store">{product.store}</span>}
          {showDescription && product.description && <span className="product-row-description">{product.description}</span>}
          <span className="product-row-prices">
            <b>{product.price}</b>
            {product.before && <s>{product.before}</s>}
            {product.discount && <span className="product-row-pct">{product.discount}</span>}
          </span>
        </span>
        <span className="product-row-media">
          <img src={product.img} alt="" loading="lazy" />
        </span>
      </button>
      <AddButton product={product} className="add-button--row" />
    </li>
  )
}
