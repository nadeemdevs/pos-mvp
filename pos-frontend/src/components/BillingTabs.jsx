import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useCartStore, tabTitle } from '../store/cartStore'
import ConfirmDialog from './ConfirmDialog'

// Browser-style order tabs for the billing page. Each tab is an independent
// cart; the dot shows green when the cart is empty and orange when an order
// is pending in it. Shortcuts: Alt+N new tab, Alt+W close tab, Alt+1..9 switch.
export default function BillingTabs() {
  const tabs = useCartStore((s) => s.tabs)
  const activeTabId = useCartStore((s) => s.activeTabId)
  const newTab = useCartStore((s) => s.newTab)
  const closeTab = useCartStore((s) => s.closeTab)
  const setActiveTab = useCartStore((s) => s.setActiveTab)
  const renameTab = useCartStore((s) => s.renameTab)

  const [closingTab, setClosingTab] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [draftName, setDraftName] = useState('')
  const renameInputRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select()
  }, [renamingId])

  // Keep the active tab visible — a newly created tab lands at the far right
  // of an overflowing strip, and Alt+1..9 can jump to an off-screen tab.
  useEffect(() => {
    scrollRef.current
      ?.querySelector('.billing-tab.active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId, tabs.length])

  // Empty tabs close silently; a tab with items gets a confirm dialog so a
  // misclick can't silently throw away an order.
  const requestClose = (tab) => {
    if (tab.cart.items.length === 0) closeTab(tab.id)
    else setClosingTab(tab)
  }

  useEffect(() => {
    const onKeyDown = (e) => {
      // e.code keeps these working on macOS, where Option+letter types a
      // special character instead of the letter itself.
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      if (e.code === 'KeyN') {
        e.preventDefault()
        newTab()
      } else if (e.code === 'KeyW') {
        e.preventDefault()
        const s = useCartStore.getState()
        const active = s.tabs.find((t) => t.id === s.activeTabId)
        if (active) requestClose(active)
      } else if (/^Digit[1-9]$/.test(e.code)) {
        const idx = Number(e.code.slice(5)) - 1
        const s = useCartStore.getState()
        if (s.tabs[idx]) {
          e.preventDefault()
          setActiveTab(s.tabs[idx].id)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // requestClose reads fresh state via getState(); safe to bind once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startRename = (tab) => {
    setRenamingId(tab.id)
    setDraftName(tab.name || tabTitle(tab))
  }

  const commitRename = () => {
    if (renamingId) renameTab(renamingId, draftName)
    setRenamingId(null)
  }

  return (
    <div className="billing-tabs" role="tablist">
      <div className="billing-tabs-scroll" ref={scrollRef}>
      {tabs.map((tab) => {
        const pending = tab.cart.items.length > 0
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`billing-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => startRename(tab)}
            title={`${tabTitle(tab)} — double-click to rename`}
          >
            <span
              className={`billing-tab-dot ${pending ? 'pending' : ''}`}
              title={pending ? 'Order pending' : 'Empty'}
            />
            {renamingId === tab.id ? (
              <input
                ref={renameInputRef}
                className="billing-tab-rename"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="billing-tab-title">{tabTitle(tab)}</span>
            )}
            <button
              className="billing-tab-close"
              aria-label={`Close ${tabTitle(tab)}`}
              onClick={(e) => {
                e.stopPropagation()
                requestClose(tab)
              }}
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
      </div>

      <button
        className="billing-tab-add"
        onClick={() => newTab()}
        title="New tab (Alt+N)"
        aria-label="New tab"
      >
        <Plus size={16} />
      </button>

      <ConfirmDialog
        open={!!closingTab}
        title="Close tab?"
        message={
          closingTab
            ? `"${tabTitle(closingTab)}" has ${closingTab.cart.items.length} item(s) in its cart. Closing it will discard the order.`
            : ''
        }
        confirmLabel="Close tab"
        danger
        onConfirm={() => {
          closeTab(closingTab.id)
          setClosingTab(null)
        }}
        onCancel={() => setClosingTab(null)}
      />
    </div>
  )
}
