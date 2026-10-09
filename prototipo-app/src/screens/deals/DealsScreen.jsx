import HScroll from '../../components/HScroll'
import { DealCard, ProductCard } from '../../components/ProductCard'
import TabPage from '../../components/TabPage'
import { useToast } from '../../components/Toast'
import { CrownIcon } from '../../components/Icons'
import { findStore } from '../../data/catalog'
import dealsCrown from '../../assets/deals-crown.webp'
import { RestaurantCard } from '../home/StoreCards'
import {
  CRAZY_DEALS,
  GROCERY_SECTIONS,
  LOWER_FEES,
  MOST_ORDERED,
  NEW_IN_RAPPI,
  TOP_PIZZAS,
  TOP_PIZZAS_ICON,
} from './data'
import './deals.css'

/** Pestaña Offers → "Deals" (video del 26-09-2026). */
export default function DealsScreen({ push }) {
  const toast = useToast()
  const openStore = (store) => push('store', { store })
  // Con el producto tocado: la tienda registra que se vio.
  const openStoreByName = (item) =>
    push('store', { store: findStore(item.store) ?? { name: item.store, img: item.img }, item })

  return (
    <TabPage
      title="Deals"
      color="#1f84f5"
      className="deals"
      action={
        <button type="button" className="tap" aria-label="Rappi Pro" onClick={() => toast()}>
          <img className="deals-crown" src={dealsCrown} alt="" />
        </button>
      }
    >
      <h2 className="section-title deals-title">Crazy Deals</h2>
      <HScroll className="deals-crazy">
        {CRAZY_DEALS.map((deal) => (
          <DealCard key={deal.id} deal={deal} onClick={() => openStoreByName(deal)} />
        ))}
      </HScroll>

      <RestaurantSection title="Now with lower fees" stores={LOWER_FEES} onOpen={openStore} push={push} />
      <RestaurantSection title="Most Ordered" stores={MOST_ORDERED} onOpen={openStore} push={push} />

      <section className="deals-pizzas">
        <div className="section-head">
          <img className="deals-pizza-icon" src={TOP_PIZZAS_ICON} alt="" />
          <div className="deals-pizza-title">
            <h2>
              <strong>Top 10</strong> Pizzas
            </h2>
            <span className="free-delivery">
              <CrownIcon size={13} />
              Up to 50% OFF
            </span>
          </div>
          <button type="button" className="see-more tap" onClick={() => push('list', { title: 'Top 10 Pizzas', products: TOP_PIZZAS })}>
            See all
          </button>
        </div>
        <div className="deals-pizza-band">
          <HScroll className="card-row deals-pizza-row">
            {TOP_PIZZAS.map((deal) => (
              <DealCard key={deal.id} deal={deal} boxed onClick={() => openStoreByName(deal)} />
            ))}
          </HScroll>
        </div>
      </section>

      <RestaurantSection title="New in Rappi" stores={NEW_IN_RAPPI} onOpen={openStore} push={push} isStatic />

      {GROCERY_SECTIONS.map((section) => (
        <section key={section.id} className="deals-grocery">
          <h2 className="section-title deals-grocery-title">
            <img src={section.icon} alt="" />
            {section.title}
          </h2>
          <HScroll className="deals-product-row">
            {section.products.map((product) => (
              <ProductCard key={product.id} product={product} onOpenStore={() => openStoreByName(product)} />
            ))}
          </HScroll>
        </section>
      ))}
    </TabPage>
  )
}

function RestaurantSection({ title, stores, onOpen, push, isStatic = false }) {
  const complete = stores.filter((store) => !store.partial)
  const onMore = () => push('list', { title, stores: complete })
  const cards = stores.map((store) => (
    <RestaurantCard key={store.id} store={store} onClick={() => (store.partial ? onMore() : onOpen(store))} />
  ))
  return (
    <section className="deals-restaurants">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <button type="button" className="see-more tap" onClick={onMore}>
          See more
        </button>
      </div>
      {isStatic ? (
        <div className="card-row card-row--static deals-card-row">{cards}</div>
      ) : (
        <HScroll className="card-row deals-card-row">{cards}</HScroll>
      )}
    </section>
  )
}
