import { create } from 'zustand'

let idCounter = 0

export const useToastStore = create((set, get) => ({
  toasts: [],

  push: (message, type = 'info') => {
    const id = ++idCounter
    set({ toasts: [...get().toasts, { id, message, type }] })
    setTimeout(() => {
      set({ toasts: get().toasts.filter((t) => t.id !== id) })
    }, 3000)
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export function toast(message, type = 'info') {
  useToastStore.getState().push(message, type)
}
