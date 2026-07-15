import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCategories } from '../services/categoryService'
import { getMenuItems } from '../services/menuService'
import { formatCurrency } from '../utils/format'
import Spinner from './Spinner'
import EmptyState from './EmptyState'

// Category-chips + search + item-grid menu browser shared by BillingPage
// (counter sale) and OrderPage (dine-in ordering). Both callers decide what
// happens on a tap via onItemClick — BillingPage adds straight to the cart,
// OrderPage may open a modifiers popover first.
export default function MenuPicker({ currency = 'INR', onItemClick }) {
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')

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
          menuItems.map((item) => (
            <button
              key={item._id || item.id}
              className="menu-item-card"
              onClick={() => onItemClick?.(item)}
            >
              <span className="menu-item-name">{item.name}</span>
              <span className="menu-item-price">{formatCurrency(item.price, currency)}</span>
              {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                <span className="menu-item-modifier-hint">{item.modifiers.length} modifiers</span>
              )}
            </button>
          ))
        )}
      </div>
    </>
  )
}
