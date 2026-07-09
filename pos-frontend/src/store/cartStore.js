import { create } from 'zustand'

const initialState = {
  items: [], // {menuItemId, name, price, qty, taxRate}
  discount: 0,
  customer: { name: '', phone: '' },
  heldInvoiceId: null,
}

export const useCartStore = create((set, get) => ({
  ...initialState,

  add: (item) => {
    const items = get().items
    const idx = items.findIndex((i) => i.menuItemId === item.menuItemId)
    if (idx >= 0) {
      const next = [...items]
      next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
      set({ items: next })
    } else {
      set({ items: [...items, { ...item, qty: 1 }] })
    }
  },

  increment: (menuItemId) => {
    set({
      items: get().items.map((i) =>
        i.menuItemId === menuItemId ? { ...i, qty: i.qty + 1 } : i,
      ),
    })
  },

  decrement: (menuItemId) => {
    const items = get().items
      .map((i) => (i.menuItemId === menuItemId ? { ...i, qty: i.qty - 1 } : i))
      .filter((i) => i.qty > 0)
    set({ items })
  },

  remove: (menuItemId) => {
    set({ items: get().items.filter((i) => i.menuItemId !== menuItemId) })
  },

  setDiscount: (discount) => set({ discount: Number(discount) || 0 }),

  setCustomer: (customer) => set({ customer }),

  setHeldInvoiceId: (id) => set({ heldInvoiceId: id }),

  loadInvoice: (invoice) => {
    set({
      items: (invoice.items || []).map((i) => ({
        menuItemId: i.menuItemId,
        name: i.name,
        price: i.price,
        qty: i.qty,
        taxRate: i.taxRate,
      })),
      discount: invoice.discount || 0,
      customer: invoice.customer || { name: '', phone: '' },
      heldInvoiceId: invoice._id || invoice.id || null,
    })
  },

  clear: () => set({ ...initialState, customer: { name: '', phone: '' } }),

  getSubtotal: () => {
    return get().items.reduce((sum, i) => sum + i.price * i.qty, 0)
  },

  getTax: () => {
    return get().items.reduce(
      (sum, i) => sum + (i.price * i.qty * (i.taxRate || 0)) / 100,
      0,
    )
  },

  getTotal: () => {
    const subtotal = get().getSubtotal()
    const tax = get().getTax()
    const discount = get().discount || 0
    return Math.max(subtotal + tax - discount, 0)
  },
}))
