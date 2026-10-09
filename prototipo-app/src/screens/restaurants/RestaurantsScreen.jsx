import { useState } from 'react'
import BackButton from '../../components/BackButton'
import Carousel, { Dots } from '../../components/Carousel'
import HScroll from '../../components/HScroll'
import Img from '../../components/Img'
import { useToast } from '../../components/Toast'
import {
  BoltIcon,
  ChevronDown,
  CrownIcon,
  SearchIcon,
  SlidersIcon,
  StarIcon,
  TrophyIcon } from '../../components/Icons'
import { useOpenSearch } from '../../hooks/useOpenSearch'
import { useAddress } from '../../state/AddressContext'
import { REAL_RESTAURANTS } from '../../data/realMenus'
import { RestaurantCard } from '../home/StoreCards'
import { BANNERS, CATEGORIES, FILTERS, ORDER_AGAIN } from './data'
import './restaurants.css'

const FILTER_ICONS = {
  trophy: () => <TrophyIcon size={17} />,
  bolt: () => <BoltIcon size={17} />,
  star: (active) => <StarIcon size={17} filled={active} /> }

export default function RestaurantsScreen({ back, push }) {
  const toast = useToast()
  const address = useAddress()
  const openSearch = useOpenSearch(push)
  const [activeFilters, setActiveFilters] = useState(() => new Set())
  const [bannerIndex, setBannerIndex] = useState(0)

  const toggleFilter = (id) =>
    setActiveFilters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="screen restaurants">
      <header className="rest-header">
        <BackButton className="round-button" onClick={back} />
        <button type="button" className="rest-address tap" onClick={address.openSheet}>
          {address.selected.line}
          <ChevronDown size={17} />
        </button>
      </header>

      <div className="rest-search-wrap">
        <button type="button" className="search-bar tap" onClick={() => openSearch('restaurants')}>
          <SearchIcon size={21} />
          <span className="search-hint">Search for dishes or restaurants</span>
        </button>
      </div>

      <HScroll className="rest-filters">
        <button
          type="button"
          className="filter-chip filter-chip--icon tap"
          aria-label="Filtros"
          onClick={() => toast()}
        >
          <SlidersIcon size={19} />
        </button>
        {FILTERS.map((filter) => {
          const isActive = activeFilters.has(filter.id)
          const onClick = filter.kind === 'toggle' ? () => toggleFilter(filter.id) : () => toast()
          return (
            <button
              key={filter.id}
              type="button"
              className={isActive ? 'filter-chip is-active tap' : 'filter-chip tap'}
              aria-pressed={filter.kind === 'toggle' ? isActive : undefined}
              onClick={onClick}
            >
              {filter.icon && FILTER_ICONS[filter.icon](isActive)}
              {filter.label}
              {filter.kind === 'menu' && <ChevronDown size={15} />}
            </button>
          )
        })}
      </HScroll>

      <div className="rest-categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className="rest-category tap"
            onClick={() => push('search', { query: cat.query, vertical: 'restaurants' })}
          >
            <span className={cat.partial ? 'rest-category-img is-partial' : 'rest-category-img'}>
              <img src={cat.img} alt="" loading="lazy" />
            </span>
            <span className="rest-category-label">{cat.label}</span>
          </button>
        ))}
      </div>

      <Carousel className="rest-banners" autoplayMs={4500} onIndexChange={setBannerIndex}>
        {BANNERS.map((banner) => (
          <button
            key={banner.id}
            type="button"
            className="rest-banner"
            aria-label={banner.title ? undefined : banner.store.name}
            onClick={() =>
              push('store', {
                store: banner.store ?? {
                  name: banner.place.replace(/^at /, ''),
                  img: banner.img,
                  deliveryLabel: 'FREE DELIVERY',
                  eta: '15 min' } })
            }
          >
            {banner.title ? (
              <>
                <span className="rest-banner-text">
                  <strong>{banner.title}</strong>
                  <span>{banner.place}</span>
                </span>
                <img className="rest-banner-photo" src={banner.img} alt="" draggable="false" loading="lazy" />
              </>
            ) : (
              <img className="rest-banner-full" src={banner.img} alt="" draggable="false" loading="lazy" />
            )}
          </button>
        ))}
      </Carousel>
      <Dots count={BANNERS.length} active={bannerIndex} className="rest-banner-dots" />

      <h2 className="section-title rest-title">Order again</h2>
      <HScroll className="rest-again">
        {ORDER_AGAIN.map((item) => (
          <button
            key={item.id}
            type="button"
            className="again-card tap"
            onClick={() =>
              push('store', {
                store: { name: item.name, img: item.img, eta: item.eta, deliveryLabel: 'FREE DELIVERY' } })
            }
          >
            <Img src={item.img} draggable="false" />
            <span className="again-name">{item.name}</span>
            <span className="again-meta">
              {item.eta}
              <span className="free-delivery">
                <CrownIcon size={13} />
                FREE DELIVERY
              </span>
            </span>
          </button>
        ))}
      </HScroll>

      {REAL_RESTAURANTS.length > 0 && (
        <>
          <h2 className="section-title rest-title">Cerca de ti</h2>
          <p className="rest-real-note">Menús y precios reales de Rappi Chile</p>
          <HScroll className="rest-real">
            {REAL_RESTAURANTS.map((store) => (
              <RestaurantCard
                key={store.id}
                store={store}
                onClick={() =>
                  // Con el id: dos sucursales pueden tener el mismo nombre y cada una tiene su menú.
                  push('store', {
                    store: { id: store.id, name: store.name, img: store.img, eta: store.eta, rating: store.rating } })
                }
              />
            ))}
          </HScroll>
        </>
      )}
    </div>
  )
}
