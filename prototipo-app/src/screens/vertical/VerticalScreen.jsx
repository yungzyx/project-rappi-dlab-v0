import { useState } from 'react'
import BackButton from '../../components/BackButton'
import Carousel, { Dots } from '../../components/Carousel'
import HScroll from '../../components/HScroll'
import { ProductCard } from '../../components/ProductCard'
import { useToast } from '../../components/Toast'
import { BoltIcon, ChevronDown, ClockIcon, CrownIcon, SearchIcon } from '../../components/Icons'
import { useOpenSearch } from '../../hooks/useOpenSearch'
import { useAddress } from '../../state/AddressContext'
import { VERTICALS, toStore } from './data'
import './vertical.css'

/** Plantilla común de Grocery, Pharmacy, Retail, Liquor, Express, Pet y Chocolates. */
export default function VerticalScreen({ back, push, params }) {
  // Un id desconocido (enlace viejo) no rompe la pantalla: muestra un estado vacío más abajo.
  const vertical = VERTICALS[params.id]
  const sections = vertical?.sections ?? []
  const toast = useToast()
  const address = useAddress()
  const openSearch = useOpenSearch(push)

  const allProducts = sections.filter((s) => s.type === 'products').flatMap((s) => s.products)
  // Con la vertical de la pantalla (no `map(toStore)`: map le pasaría el índice como vertical).
  const asStore = (store) => toStore(store, params.id)
  const allStores = sections.filter((s) => s.type === 'stores').flatMap((s) => s.stores.map(asStore))
  const openCategory = (category) =>
    push('list', { title: category.label, products: allProducts, stores: allStores })
  const openStore = (store) => push('store', { store })
  // Con el producto tocado: la tienda registra que se vio.
  const openProductStore = (item) =>
    push('store', {
      store: { name: item.store, img: item.storeLogo ?? item.img, logo: true, eta: item.eta, etaIcon: item.etaIcon },
      item })
  const openBanner = (banner) => (banner.store ? openStore(banner.store) : toast(banner.toast))

  if (!vertical)
    return (
      <div className="screen vertical">
        <header className="vertical-header">
          <BackButton className="round-button" onClick={back} />
        </header>
        <p className="vertical-empty">Esta categoría no está en el prototipo.</p>
      </div>
    )

  return (
    <div className="screen vertical">
      <header className="vertical-header">
        <BackButton className="round-button" onClick={back} />
        <button type="button" className="vertical-address tap" onClick={address.openSheet}>
          <span>{address.selected.line}</span>
          <ChevronDown size={18} />
        </button>
      </header>

      <div className="vertical-search-wrap">
        <button type="button" className="search-bar tap" onClick={() => openSearch(params.id)}>
          <SearchIcon size={21} />
          <span className="vertical-search-hint">Search stores or products</span>
        </button>
      </div>

      {vertical.categoryRows.length > 0 && (
        <CategoryGrid rows={vertical.categoryRows} scrollable={vertical.scrollCategories} onOpen={openCategory} />
      )}


      {vertical.banners && <BannerCarousel banners={vertical.banners} onOpen={openBanner} />}

      {vertical.sections.map((section) =>
        section.type === 'products' ? (
          <section key={section.title} className="vertical-section vertical-section--products">
            <div className="section-head">
              <h2 className="vertical-title-strong">{section.title}</h2>
              <button
                type="button"
                className="see-all tap"
                onClick={() => push('list', { title: section.title, products: section.products })}
              >
                See all
              </button>
            </div>
            <div className="vertical-product-row">
              {section.products.map((item) => (
                <ProductCard key={item.id} product={item} onOpenStore={() => openProductStore(item)} />
              ))}
            </div>
          </section>
        ) : (
          <StoreSection
            key={section.title}
            section={section}
            onOpen={(store) => openStore(asStore(store))}
            onMore={() => push('list', { title: section.title, stores: section.stores.map(asStore) })}
          />
        ),
      )}
    </div>
  )
}

function CategoryGrid({ rows, scrollable, onOpen }) {
  const grid = (
    <div className="vertical-cats-grid" style={{ gridTemplateColumns: `repeat(${rows[0].length}, 84px)` }}>
      {rows.flat().map((category) => (
        <button key={category.id} type="button" className="vertical-cat tap" onClick={() => onOpen(category)}>
          <span className={category.partial ? 'vertical-cat-img is-partial' : 'vertical-cat-img'}>
            <img src={category.img} alt="" draggable="false" />
          </span>
          <span className="vertical-cat-label">{category.label}</span>
        </button>
      ))}
    </div>
  )
  // Filas cortadas en el borde de la captura no hacen scroll: al deslizar se vería el recorte.
  return scrollable ? <HScroll className="vertical-cats">{grid}</HScroll> : <div className="vertical-cats">{grid}</div>
}

function BannerCarousel({ banners, onOpen }) {
  const [index, setIndex] = useState(0)
  return (
    <>
      <Carousel className="vertical-banners" autoplayMs={banners.length > 1 ? 4500 : 0} onIndexChange={setIndex}>
        {banners.map((banner) => (
          <button
            key={banner.id}
            type="button"
            className="vertical-banner"
            aria-label={banner.label ?? banner.store?.name}
            onClick={() => onOpen(banner)}
          >
            <img src={banner.img} alt="" draggable="false" loading="lazy" />
          </button>
        ))}
      </Carousel>
      {banners.length > 1 && <Dots count={banners.length} active={index} className="vertical-banner-dots" />}
    </>
  )
}

function StoreSection({ section, onOpen, onMore }) {
  return (
    <section className="vertical-section vertical-section--stores">
      <div className="section-head">
        <h2 className="section-title">{section.title}</h2>
        <button type="button" className="see-more tap" onClick={onMore}>
          View more
        </button>
      </div>
      <div className="vertical-store-list">
        {section.stores.map((store) => (
          <button key={store.id} type="button" className="vertical-store tap" onClick={() => onOpen(store)}>
            <img src={store.logo} alt="" className="vertical-store-logo" loading="lazy" />
            <span className="vertical-store-text">
              <span className="vertical-store-name">
                <strong>{store.name}</strong>
                {store.ad && <span className="vertical-ad">Ad</span>}
              </span>
              <span className="vertical-store-eta">
                {store.etaIcon === 'clock' ? (
                  <ClockIcon size={16} />
                ) : (
                  <BoltIcon size={16} className="vertical-bolt" />
                )}
                {store.eta}
              </span>
              {store.promo && (
                <span className="vertical-promo">
                  {store.promoCrown && <CrownIcon size={15} />}
                  {store.promo}
                </span>
              )}
            </span>
          </button>
        ))}
        {/* Columna siguiente asomándose por el borde, recortada tal cual de la captura */}
        <img className="vertical-peek" src={section.peek.img} alt="" loading="lazy" style={{ top: section.peek.top }} />
      </div>
    </section>
  )
}
