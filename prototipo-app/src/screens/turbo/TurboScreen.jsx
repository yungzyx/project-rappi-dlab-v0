import { useState } from 'react'
import BottomNav from '../../components/BottomNav'
import HScroll from '../../components/HScroll'
import NotReplicated from '../../components/NotReplicated'
import { useToast } from '../../components/Toast'
import { useOpenSearch } from '../../hooks/useOpenSearch'
import {
  BadgePercentIcon,
  ChevronLeft,
  GridIcon,
  HeartIcon,
  LampIcon,
  MoreIcon,
  SearchIcon,
  SpeedBoltIcon,
} from '../../components/Icons'
import turboLogo from '../../assets/turbo-logo.webp'
import turboHero from '../../assets/turbo-hero.webp'
import turboCrown from '../../assets/turbo-crown.webp'
import tabTodo from '../../assets/tab-todo.webp'
import tabFrescos from '../../assets/tab-frescos.webp'
import tabDespensa from '../../assets/tab-despensa.webp'
import tabPicoteo from '../../assets/tab-picoteo.webp'
import promo18Chico from '../../assets/promo-18chico.webp'
import promoHealthy from '../../assets/promo-healthy.webp'
import './turbo.css'

const TABS = [
  { id: 'todo', label: 'Todo', img: tabTodo },
  { id: 'frescos', label: 'Frescos', img: tabFrescos },
  { id: 'despensa', label: 'Despensa', img: tabDespensa },
  { id: 'picoteo', label: 'Picoteo', img: tabPicoteo },
  { id: 'home', label: 'Home', Icon: LampIcon },
]

const PROMOS = [
  { id: 'chico', img: promo18Chico },
  { id: 'healthy', img: promoHealthy },
]

const NAV_ITEMS = [
  { id: 'turbo', label: 'Turbo', Icon: SpeedBoltIcon },
  { id: 'favorites', label: 'Favorites', Icon: HeartIcon },
  { id: 'offers', label: 'Offers', Icon: BadgePercentIcon },
  { id: 'categories', label: 'Categories', Icon: GridIcon },
]

// Monto que falta para el 100 % de descuento en la tarifa de servicio (captura 9110).
const FEE_REMAINING = '$29.900'

export default function TurboScreen({ back, push }) {
  const toast = useToast()
  const openSearch = useOpenSearch(push)
  const [tab, setTab] = useState('turbo')
  const tabLabel = NAV_ITEMS.find((item) => item.id === tab).label

  return (
    <>
      {tab === 'turbo' ? (
        <TurboFeed back={back} toast={toast} onSearch={() => openSearch('turbo')} />
      ) : (
        <NotReplicated title={tabLabel} />
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

function TurboFeed({ back, toast, onSearch }) {
  const [category, setCategory] = useState('todo')

  return (
    <div className="screen turbo">
      <div className="turbo-green">
        <header className="turbo-header">
          <button type="button" className="turbo-round tap" aria-label="Volver" onClick={back}>
            <ChevronLeft size={20} />
          </button>
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

      <button type="button" className="turbo-hero" onClick={() => toast()}>
        <img src={turboHero} alt="Todo tu súper y más en minutos" />
      </button>

      <div className="turbo-fee">
        <img src={turboCrown} alt="" />
        <div>
          <p className="turbo-fee-title">100% OFF on Service Fee</p>
          <p className="turbo-fee-sub">
            Add <strong>{FEE_REMAINING}</strong> to enjoy this discount.
          </p>
        </div>
        <div className="turbo-fee-track">
          <span className="turbo-fee-check" />
        </div>
      </div>

      <HScroll className="turbo-promos">
        {PROMOS.map((promo) => (
          <button key={promo.id} type="button" className="turbo-promo tap" onClick={() => toast()}>
            <img src={promo.img} alt="" draggable="false" />
          </button>
        ))}
      </HScroll>
    </div>
  )
}
