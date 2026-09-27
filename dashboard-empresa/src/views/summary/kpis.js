import { formatNumber, formatPct } from '../../lib/format.js'

// Indicadores de /analytics/kpis con su definición corta (docs/diseno-ia.md §5) y la ventana que usa la API.
export const KPI_GROUPS = [
  {
    title: 'Frecuencia',
    items: [
      {
        key: 'usuarios_activos',
        label: 'Usuarios activos',
        window: '30 días',
        format: formatNumber,
        definition: 'Al menos una sesión en los últimos 30 días.',
      },
      {
        key: 'frecuencia',
        label: 'Frecuencia',
        window: '30 días',
        format: (value) => formatNumber(value, 2),
        unit: 'pedidos por activo',
        definition: 'Pedidos / usuarios activos (30 días).',
        context: (kpis) => `${formatNumber(kpis.pedidos_30d)} pedidos en 30 días`,
      },
      {
        key: 'mediana_dias_entre_pedidos',
        label: 'Días entre pedidos',
        window: '180 días',
        format: (value) => formatNumber(value, 1),
        unit: 'mediana',
        definition: 'Mediana por usuario y luego mediana entre usuarios.',
      },
      {
        key: 'multi_vertical_pct',
        label: 'Multi-vertical',
        window: '60 días',
        format: formatPct,
        definition: 'Pidieron en 2 o más verticales en 60 días.',
      },
    ],
  },
  {
    title: 'Abandono y fuga',
    items: [
      {
        key: 'abandono_carrito_pct',
        label: 'Abandono de carrito',
        window: 'todo el período',
        format: formatPct,
        definition:
          'Carros con al menos un producto, cuyo último evento de carro fue hace más de 24 h y sin pedido, sobre todos los carros con productos.',
      },
      {
        key: 'busquedas_sin_resultado_pct',
        label: 'Búsquedas sin resultado',
        window: '30 días',
        format: formatPct,
        definition: 'Búsquedas y consultas a Bigotes sin resultado: cada una queda registrada como demanda no satisfecha.',
      },
      {
        key: 'en_riesgo',
        label: 'En riesgo',
        status: 'warn',
        format: formatNumber,
        unit: 'usuarios',
        definition: 'Días desde el último pedido > máx(2 × su ritmo, 21).',
      },
      {
        key: 'perdidos',
        label: 'Perdidos',
        status: 'bad',
        format: formatNumber,
        unit: 'usuarios',
        definition: 'Días desde el último pedido > máx(3 × su ritmo, 45).',
      },
    ],
  },
]
