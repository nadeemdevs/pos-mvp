import { create } from 'zustand'

const initialState = {
  items: [], // {menuItemId, name, price, qty, taxRate}
  discountType: null, // 'FLAT' | 'PERCENT' | null
  discountValue: 0,
  customer: { name: '', phone: '' },
  heldInvoiceId: null,
  note: '',
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

  setDiscountType: (discountType) => set({ discountType }),

  setDiscountValue: (discountValue) => set({ discountValue: Number(discountValue) || 0 }),

  // Convenience setter for preset chips, which know both fields at once.
  setDiscount: (discountType, discountValue) =>
    set({ discountType, discountValue: Number(discountValue) || 0 }),

  clearDiscount: () => set({ discountType: null, discountValue: 0 }),

  setCustomer: (customer) => set({ customer }),

  setNote: (note) => set({ note }),

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
      discountType: invoice.discountType || null,
      discountValue: invoice.discountValue || 0,
      customer: invoice.customer || { name: '', phone: '' },
      heldInvoiceId: invoice._id || invoice.id || null,
      note: invoice.note || '',
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

  // PERCENT applies to subtotal+tax; FLAT is capped so the discount can
  // never push the total below zero.
  getDiscountAmount: () => {
    const { discountType, discountValue } = get()
    if (!discountType || !discountValue) return 0
    const base = get().getSubtotal() + get().getTax()
    const amount = discountType === 'PERCENT' ? (base * discountValue) / 100 : discountValue
    return Math.min(Math.max(amount, 0), base)
  },

  getTotal: () => {
    const subtotal = get().getSubtotal()
    const tax = get().getTax()
    const discount = get().getDiscountAmount()
    return Math.max(subtotal + tax - discount, 0)
  },
}))
