import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Tracks which branch the current staff session is scoped to. Single-branch
// operators never touch this — it defaults to 'main' and the branch selector
// in AppLayout stays hidden until /api/branches reports more than one active
// branch. api.js reads this store directly (outside React) to attach the
// x-branch-id header on every request.
export const useBranchStore = create(
  persist(
    (set) => ({
      activeBranch: 'main',
      setActiveBranch: (code) => set({ activeBranch: code || 'main' }),
    }),
    {
      name: 'pos-branch',
    },
  ),
)
