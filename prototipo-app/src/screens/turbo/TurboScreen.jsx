import { useRef, useState } from 'react'
import BackButton from '../../components/BackButton'
import BottomNav from '../../components/BottomNav'
import HScroll from '../../components/HScroll'
import { ProductCard } from '../../components/ProductCard'
import TabPage from '../../components/TabPage'
import { useToast } from '../../components/Toast'
import { findStore } from '../../data/catalog'
import { useOpenSearch } from '../../hooks/useOpenSearch'
import { formatPrice, useCart } from '../../state/CartContext'
import FavoritesScreen from '../favorites/FavoritesScreen'
import {
  BadgePercentIcon,
  GridIcon,
  HeartIcon,
  LampIcon,
  MoreIcon,
  SearchIcon,
  SpeedBoltIcon } from '../../components/Icons'
import turboLogo from '../../assets/turbo-logo.webp'
import turboHero from '../../assets/turbo-hero.webp'
import turboCrown from '../../assets/turbo-crown.webp'
import tabTodo from '../../assets/tab-todo.webp'
import tabFrescos from '../../assets/tab-frescos.webp'
import tabDespensa from '../../assets/tab-despensa.webp'
import tabPicoteo from '../../assets/tab-picoteo.webp'
import promo18Chico from '../../assets/promo-18chico.webp'
import promoHealthy from '../../assets/promo-healthy.webp'
import { TURBO_OFFERS, productsForTab } from './data'
import './turbo.css'

const TABS = [
  { id: 'todo', label: 'Todo', img: tabTodo },
  { id: 'frescos', label: 'Frescos', img: tabFrescos },
  { id: 'despensa', label: 'Despensa', img: tabDespensa },
  { id: 'picoteo', label: 'Picoteo', img: tabPicoteo },
  { id: 'home', label: 'Home', Icon: LampIcon },
]

// Cada promo lleva a la pestaña de productos que corresponde.
const PROMOS = [
  { id: 'chico', img: promo18Chico, tab: 'picoteo', label: 'Fiestas Patrias: picoteo' },
  { id: 'healthy', img: promoHealthy, tab: 'frescos', label: 'Saludable: frescos' },
]

const NAV_ITEMS = [
  { id: 'turbo', label: 'Turbo', Icon: SpeedBoltIcon },
  { id: 'favorites', label: 'Favorites', Icon: HeartIcon },
  { id: 'offers', label: 'Offers', Icon: BadgePercentIcon },
  { id: 'categories', label: 'Categories', Icon: GridIcon },
]

// Monto del carro para el 100 % de descuento en la tarifa de servicio (captura 9110).
const FEE_GOAL = 29900

export default function TurboScreen({ back, push }) {
  const toast = useToast()
  const openSearch = useOpenSearch(push)
  const [tab, setTab] = useState('turbo')
  const [category, setCategory] = useState('todo')
  const openStore = (item) => push('store', { store: findStore(item.store) ?? { name: item.store, img: item.img }, item })
  // Categories lleva a la pestaña de productos que se tocó.
  const showCategory = (id) => {
    setCategory(id)
    setTab('turbo')
  }

  return (
    <>
      {tab === 'turbo' && (
        <TurboFeed
          back={back}
          toast={toast}
          category={category}
          setCategory={setCategory}
          onOpenStore={openStore}
          onSearch={() => openSearch('turbo')}
        />
      )}
      {tab === 'favorites' && <FavoritesScreen push={push} />}
      {tab === 'offers' && (
        <TabPage title="Offers" color="#3e7b4b" className="turbo-page">
          <p className="turbo-page-note">Productos con descuento en Turbo</p>
          <ProductGrid products={TURBO_OFFERS} onOpenStore={openStore} />
        </TabPage>
      )}
      {tab === 'categories' && (
        <TabPage title="Categories" color="#3e7b4b" className="turbo-page">
          <ul className="turbo-categories">
            {TABS.map(({ id, label, img, Icon }) => (
              <li key={id}>
                <button type="button" className="turbo-category tap" onClick={() => showCategory(id)}>
                  {img ? <img src={img} alt="" draggable="false" /> : <Icon size={28} />}
                  <span>{label}</span>
                  <small>{productsForTab(id).length} productos</small>
                </button>
              </li>
            ))}
          </ul>
        </TabPage>
      )}
      <BottomNav
        items={NAV_ITEMS}
        active={tab}
        onSelect={setTab}
        onSearch={() => openSearch('turbo')}
        className="bottom-nav--turbo"
      />
    </>
  )
}

function ProductGrid({ products, onOpenStore }) {
  return (
    <div className="turbo-grid">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} onOpenStore={() => onOpenStore(product)} />
      ))}
    </div>
  )
}

function TurboFeed({ back, toast, category, setCategory, onOpenStore, onSearch }) {
  const cart = useCart()
  const gridRef = useRef(null)
  const remaining = Math.max(FEE_GOAL - cart.total, 0)
  const progress = Math.min(cart.total / FEE_GOAL, 1)
  const products = productsForTab(category)

  // El hero y las promos llevan a la grilla de la pestaña que corresponde.
  const goToCategory = (id) => {
    setCategory(id)
    gridRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <div className="screen turbo">
      <div className="turbo-green">
        <header className="turbo-header">
          <BackButton className="turbo-round" onClick={back} />
          <img className="turbo-logo" src={turboLogo} alt="Turbo" />
          <button type="button" className="turbo-round turbo-round--more tap" aria-label="Más" onClick={() => toast()}>
            <MoreIcon size={22} />
          </button>
        </header>

        <div className="turbo-eta">
          <SpeedBoltIcon size={22} />
          Delivery in <strong>15 min</strong>
        </div>

        <button type="button" className="turbo-search tap" onClick={onSearch}>
          <SearchIcon size={21} />
          Search in Turbo 20
        </button>

        <HScroll className="turbo-tabs" role="tablist">
          {TABS.map(({ id, label, img, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === category}
              className={id === category ? 'turbo-tab is-active' : 'turbo-tab'}
              onClick={() => setCategory(id)}
            >
              {img ? <img src={img} alt="" draggable="false" /> : <Icon size={28} />}
              <span>{label}</span>
            </button>
          ))}
        </HScroll>
      </div>

      <button type="button" className="turbo-hero" onClick={() => goToCategory('todo')}>
        <img src={turboHero} alt="Todo tu súper y más en minutos" />
      </button>

      <div className="turbo-fee">
        <img src={turboCrown} alt="" loading="lazy" />
        <div>
          <p className="turbo-fee-title">100% OFF on Service Fee</p>
          <p className="turbo-fee-sub">
            {remaining > 0 ? (
              <>
                Add <strong>{formatPrice(remaining)}</strong> to enjoy this discount.
              </>
            ) : (
              <>Discount unlocked.</>
            )}
          </p>
        </div>
        <div className="turbo-fee-track">
          <span className="turbo-fee-fill" style={{ width: `${progress * 100}%` }} />
          <span className={progress >= 1 ? 'turbo-fee-check is-done' : 'turbo-fee-check'} />
        </div>
      </div>

      <HScroll className="turbo-promos">
        {PROMOS.map((promo) => (
          <button
            key={promo.id}
            type="button"
            className="turbo-promo tap"
            aria-label={promo.label}
            onClick={() => goToCategory(promo.tab)}
          >
            <img src={promo.img} alt="" draggable="false" loading="lazy" />
          </button>
        ))}
      </HScroll>

      <section ref={gridRef} className="turbo-products" aria-label="Productos">
        <h2 className="section-title turbo-products-title">{TABS.find((item) => item.id === category).label}</h2>
        <ProductGrid products={products} onOpenStore={onOpenStore} />
      </section>
    </div>
  )
}
