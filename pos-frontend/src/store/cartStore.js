import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const emptyCart = () => ({
  items: [], // {menuItemId, name, price, qty, taxRate}
  discountType: null, // 'FLAT' | 'PERCENT' | null
  discountValue: 0,
  customer: { name: '', phone: '' },
  heldInvoiceId: null,
  // Set only when an invoice is loaded for editing via loadInvoice — lets
  // BillingPage tell "resuming a held bill" (PENDING) apart from "editing an
  // already-charged bill" (PAID), which needs a different save action
  // (no payment modal, no status change) and a visible warning banner.
  loadedPaymentStatus: null,
  loadedInvoiceNumber: null,
  note: '',
})

const makeTab = (num) => ({
  id: `tab-${num}`,
  num, // permanent number for the default "Tab N" title, never reused
  name: '', // cashier-set custom title; '' = derive from customer/num
  cart: emptyCart(),
})

// Derive the display title: explicit rename wins, then customer name,
// then the resumed invoice number, then the plain tab number.
export function tabTitle(tab) {
  return (
    tab.name ||
    tab.cart.customer?.name ||
    tab.cart.loadedInvoiceNumber ||
    `Tab ${tab.num}`
  )
}

export function selectActiveTab(s) {
  return s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]
}

export function selectActiveCart(s) {
  return selectActiveTab(s)?.cart || emptyCart()
}

export const useCartStore = create(
  persist(
    (set, get) => {
      // Immutably patch the active tab's cart. All the order-editing actions
      // below funnel through here so they always target the active tab.
      const patchCart = (fn) =>
        set((s) => ({
          tabs: s.tabs.map((t) =>
            t.id === s.activeTabId ? { ...t, cart: { ...t.cart, ...fn(t.cart) } } : t,
          ),
        }))

      const activeCart = () => selectActiveCart(get())

      return {
        tabs: [makeTab(1)],
        activeTabId: 'tab-1',
        tabSeq: 1, // last tab number handed out

        // ---- tab management ----

        newTab: () => {
          const num = get().tabSeq + 1
          const tab = makeTab(num)
          set((s) => ({ tabs: [...s.tabs, tab], tabSeq: num, activeTabId: tab.id }))
          return tab.id
        },

        closeTab: (id) => {
          set((s) => {
            const idx = s.tabs.findIndex((t) => t.id === id)
            if (idx === -1) return s
            let tabs = s.tabs.filter((t) => t.id !== id)
            let { activeTabId, tabSeq } = s
            if (tabs.length === 0) {
              // Never leave the cashier without a tab — closing the last one
              // just replaces it with a fresh empty tab.
              tabSeq += 1
              tabs = [makeTab(tabSeq)]
              activeTabId = tabs[0].id
            } else if (activeTabId === id) {
              // Like browsers: activate the right neighbour, else the new last tab.
              activeTabId = (tabs[idx] || tabs[tabs.length - 1]).id
            }
            return { tabs, activeTabId, tabSeq }
          })
        },

        setActiveTab: (activeTabId) => set({ activeTabId }),

        renameTab: (id, name) =>
          set((s) => ({
            tabs: s.tabs.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)),
          })),

        // ---- cart actions (always the active tab) ----

        add: (item) =>
          patchCart((c) => {
            const idx = c.items.findIndex((i) => i.menuItemId === item.menuItemId)
            if (idx >= 0) {
              const next = [...c.items]
              next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
              return { items: next }
            }
            return { items: [...c.items, { ...item, qty: 1 }] }
          }),

        increment: (menuItemId) =>
          patchCart((c) => ({
            items: c.items.map((i) =>
              i.menuItemId === menuItemId ? { ...i, qty: i.qty + 1 } : i,
            ),
          })),

        decrement: (menuItemId) =>
          patchCart((c) => ({
            items: c.items
              .map((i) => (i.menuItemId === menuItemId ? { ...i, qty: i.qty - 1 } : i))
              .filter((i) => i.qty > 0),
          })),

        remove: (menuItemId) =>
          patchCart((c) => ({
            items: c.items.filter((i) => i.menuItemId !== menuItemId),
          })),

        setDiscountType: (discountType) => patchCart(() => ({ discountType })),

        setDiscountValue: (discountValue) =>
          patchCart(() => ({ discountValue: Number(discountValue) || 0 })),

        // Convenience setter for preset chips, which know both fields at once.
        setDiscount: (discountType, discountValue) =>
          patchCart(() => ({ discountType, discountValue: Number(discountValue) || 0 })),

        clearDiscount: () => patchCart(() => ({ discountType: null, discountValue: 0 })),

        setCustomer: (customer) => patchCart(() => ({ customer })),

        setNote: (note) => patchCart(() => ({ note })),

        setHeldInvoiceId: (id) => patchCart(() => ({ heldInvoiceId: id })),

        loadInvoice: (invoice) =>
          patchCart(() => ({
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
            loadedPaymentStatus: invoice.paymentStatus || null,
            loadedInvoiceNumber: invoice.invoiceNumber || null,
            note: invoice.note || '',
          })),

        // Resets a tab for the next customer — the custom title belonged to
        // the finished order, so it goes too. Defaults to the active tab, but
        // callers that finish an order asynchronously (payment flow) pass the
        // id captured at charge time, in case the cashier switched tabs since.
        clear: (tabId) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === (tabId || s.activeTabId) ? { ...t, name: '', cart: emptyCart() } : t,
            ),
          })),

        // ---- derived totals (active tab) ----

        getSubtotal: () =>
          activeCart().items.reduce((sum, i) => sum + i.price * i.qty, 0),

        getTax: () =>
          activeCart().items.reduce(
            (sum, i) => sum + (i.price * i.qty * (i.taxRate || 0)) / 100,
            0,
          ),

        // PERCENT applies to subtotal+tax; FLAT is capped so the discount can
        // never push the total below zero.
        getDiscountAmount: () => {
          const { discountType, discountValue } = activeCart()
          if (!discountType || !discountValue) return 0
          const base = get().getSubtotal() + get().getTax()
          const amount =
            discountType === 'PERCENT' ? (base * discountValue) / 100 : discountValue
          return Math.min(Math.max(amount, 0), base)
        },

        getTotal: () => {
          const subtotal = get().getSubtotal()
          const tax = get().getTax()
          const discount = get().getDiscountAmount()
          return Math.max(subtotal + tax - discount, 0)
        },
      }
    },
    {
      name: 'pos-billing-tabs',
      partialize: (s) => ({ tabs: s.tabs, activeTabId: s.activeTabId, tabSeq: s.tabSeq }),
    },
  ),
)
