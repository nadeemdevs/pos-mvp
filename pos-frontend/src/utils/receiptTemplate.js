// Default receipt layout — must mirror receiptTemplateSchema defaults in the
// backend (setting.model.js) so tenants that never opened the designer keep
// printing the exact receipt they always have.
export const DEFAULT_RECEIPT_TEMPLATE = {
  paperWidth: 80,
  header: {
    showRestaurantName: true,
    showAddress: true,
    showPhone: true,
    showEmail: false,
    showWebsite: false,
    showBranch: false,
    showGst: false,
    gstNumber: '',
    customText: '',
  },
  columns: [
    { key: 'item', label: 'Item', visible: true },
    { key: 'qty', label: 'Qty', visible: true },
    { key: 'price', label: 'Price', visible: true },
    { key: 'total', label: 'Total', visible: true },
  ],
  totals: {
    showSubtotal: true,
    showTax: true,
    showDiscount: true,
    showRoundOff: true,
    grandTotalLabel: 'Total',
  },
  footer: { show: true, text: '' },
}

export const COLUMN_FALLBACK_LABELS = { item: 'Item', qty: 'Qty', price: 'Price', total: 'Total' }

// Deep-merge the tenant's saved template over the defaults — older settings
// documents may only have some of the nested objects.
export function resolveReceiptTemplate(template) {
  const t = template || {}
  return {
    paperWidth: t.paperWidth === 58 ? 58 : 80,
    header: { ...DEFAULT_RECEIPT_TEMPLATE.header, ...t.header },
    columns:
      Array.isArray(t.columns) && t.columns.length > 0
        ? t.columns
        : DEFAULT_RECEIPT_TEMPLATE.columns,
    totals: { ...DEFAULT_RECEIPT_TEMPLATE.totals, ...t.totals },
    footer: { ...DEFAULT_RECEIPT_TEMPLATE.footer, ...t.footer },
  }
}
