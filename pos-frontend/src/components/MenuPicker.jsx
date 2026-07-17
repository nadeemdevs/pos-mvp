import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCategories } from '../services/categoryService'
import { getMenuItems } from '../services/menuService'
import { formatCurrency } from '../utils/format'
import Spinner from './Spinner'
import EmptyState from './EmptyState'

// 8 pastel tints cycled per item (see .menu-item-card.pastel-N in index.css).
const PASTEL_COUNT = 8

// Stable per-item tint: same item always gets the same pastel across renders
// and sessions, regardless of filter/search order.
function pastelIndex(id) {
  const s = String(id)
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 997
  return hash % PASTEL_COUNT
}

// Category-chips + search + item-grid menu browser shared by BillingPage
// (counter sale) and OrderPage (dine-in ordering). Both callers decide what
// happens on a tap via onItemClick — BillingPage adds straight to the cart,
// OrderPage may open a modifiers popover first.
//
// `colorful` tints each card with a light pastel; `inCartIds` outlines cards
// whose item is already in the caller's cart. Both default off so OrderPage
// keeps its plain look.
export default function MenuPicker({ currency = 'INR', onItemClick, colorful = false, inCartIds }) {
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')

  const inCart = new Set(inCartIds || [])

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })
  const categories = Array.isArray(categoriesData)
    ? categoriesData
    : categoriesData?.items || []

  const { data: menuData, isLoading: menuLoading } = useQuery({
    queryKey: ['menu', 'picker', { category: categoryFilter, search }],
    queryFn: () =>
      getMenuItems({
        active: true,
        ...(categoryFilter ? { category: categoryFilter } : {}),
        ...(search ? { search } : {}),
      }),
  })
  const menuItems = Array.isArray(menuData) ? menuData : menuData?.items || []

  return (
    <>
      <div className="category-chips">
        <button
          className={`chip ${categoryFilter === '' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('')}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c._id || c.id}
            className={`chip ${categoryFilter === (c._id || c.id) ? 'active' : ''}`}
            onClick={() => setCategoryFilter(c._id || c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <input
        className="billing-search"
        autoFocus
        placeholder="Search menu items…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="menu-grid">
        {menuLoading ? (
          <Spinner label="Loading menu…" />
        ) : menuItems.length === 0 ? (
          <EmptyState title="No items found" />
        ) : (
          menuItems.map((item) => {
            const id = item._id || item.id
            const classes = [
              'menu-item-card',
              colorful ? `pastel-${pastelIndex(id)}` : '',
              inCart.has(id) ? 'in-cart' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <button key={id} className={classes} onClick={() => onItemClick?.(item)}>
                <span className="menu-item-name">{item.name}</span>
                <span className="menu-item-price">{formatCurrency(item.price, currency)}</span>
                {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                  <span className="menu-item-modifier-hint">{item.modifiers.length} modifiers</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </>
  )
}
