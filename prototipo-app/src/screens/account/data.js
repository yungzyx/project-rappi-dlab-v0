// Pantalla Account del video del 26-09-2026 (ScreenRecording 22-25-25, segundos 11–19).
import { AGENT_NAME } from '../../agent/name'
import {
  BellIcon,
  BillingIcon,
  CardIcon,
  CouponIcon,
  CreditsIcon,
  CrownLineIcon,
  GlobeIcon,
  HeadsetIcon,
  InfoIcon,
  LoyaltyIcon,
  MustacheIcon,
  PartnerIcon,
  PinIcon,
  ShieldIcon,
  SparkleLineIcon,
} from '../../components/LineIcons'

export const PROFILE = { initials: 'YC', name: 'Yung C.' }

export const PRO_PLAN = { savings: '$15.400', note: 'This is what a Pro user saves on average monthly.' }

export const RECENT_ORDER = { store: 'Street Wrap', date: 'September 17' }

export const APP_VERSION = 'Version  8.39 (130052)'

// `action` dice qué hace la fila en el prototipo; sin `action` muestra el aviso de pantalla no incluida.
export const SECTIONS = [
  {
    title: 'Benefits',
    rows: [
      { id: 'credits', label: 'Credits', Icon: CreditsIcon, value: '$1.900' },
      { id: 'coupons', label: 'Coupons', Icon: CouponIcon },
      { id: 'loyalty', label: 'Loyalty', Icon: LoyaltyIcon, action: 'loyalty' },
    ],
  },
  {
    title: 'My account',
    rows: [
      { id: 'rappipro', label: 'RappiPro', Icon: CrownLineIcon },
      { id: 'addresses', label: 'Addresses', Icon: PinIcon, action: 'addresses' },
      { id: 'payment', label: 'Payment methods', Icon: CardIcon },
      { id: 'billing', label: 'Billing information', Icon: BillingIcon },
      { id: 'help', label: 'Help', Icon: HeadsetIcon },
    ],
  },
  {
    title: 'Settings',
    rows: [
      { id: 'language', label: 'Language', Icon: GlobeIcon, action: 'language' },
      { id: 'notifications', label: 'Notifications', Icon: BellIcon, action: 'notifications' },
      { id: 'icon', label: 'Change Rappi icon', Icon: MustacheIcon },
      // Solo del prototipo: alterna entre Rappi hoy y el prototipo final (en notebook también con la tecla D).
      { id: 'demo', label: 'Modo demo', Icon: SparkleLineIcon, action: 'demo' },
      // Solo en el prototipo final: en el celular no está el botón «Repetir escena» de la notebook.
      { id: 'replay', label: `Repetir escena de ${AGENT_NAME}`, Icon: SparkleLineIcon, action: 'replay', finalOnly: true },
    ],
  },
  {
    title: 'More information',
    rows: [
      { id: 'partner', label: 'Become a Rappi Partner', Icon: PartnerIcon },
      { id: 'terms', label: 'Terms and Conditions', Icon: InfoIcon },
      { id: 'privacy', label: 'Privacy Policy', Icon: ShieldIcon },
    ],
  },
]

export const LANGUAGES = ['English', 'Español', 'Português']

export const NOTIFICATION_CHANNELS = [
  { id: 'push', label: 'Push notifications', defaultOn: true },
  { id: 'email', label: 'Email', defaultOn: true },
  { id: 'sms', label: 'SMS', defaultOn: false },
  { id: 'whatsapp', label: 'WhatsApp', defaultOn: false },
]
