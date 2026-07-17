import { formatCurrency, formatDateTime } from '../utils/format'
import { COLUMN_FALLBACK_LABELS, resolveReceiptTemplate } from '../utils/receiptTemplate'

function columnCell(colKey, item, currency) {
  switch (colKey) {
    case 'item':
      return item.name
    case 'qty':
      return item.qty
    case 'price':
      return formatCurrency(item.price, currency)
    case 'total':
      return formatCurrency(item.price * item.qty, currency)
    default:
      return null
  }
}

// `templateOverride` lets the designer preview an unsaved draft; real prints
// read the saved settings.receiptTemplate.
export default function Receipt({ invoice, payment, settings, templateOverride }) {
  if (!invoice) return null
  const currency = settings?.currency || 'INR'
  const template = resolveReceiptTemplate(templateOverride || settings?.receiptTemplate)
  const { header, totals, footer } = template
  const columns = template.columns.filter((c) => c.visible)
  // sgst/cgst are only non-zero when the invoice was created while
  // settings.country was 'India' — this keeps reprints of older invoices
  // consistent even if the setting is toggled afterwards.
  const hasGstSplit = (invoice.sgst || 0) > 0 || (invoice.cgst || 0) > 0
  const footerText = footer.text || settings?.receiptFooter || 'Thank you for visiting!'

  return (
    <div className={`receipt receipt-${template.paperWidth}`} id="print-receipt">
      <div className="receipt-header">
        {header.showRestaurantName && <h2>{settings?.restaurantName || 'Restaurant'}</h2>}
        {header.showAddress && settings?.address && <p>{settings.address}</p>}
        {header.showPhone && settings?.phone && <p>{settings.phone}</p>}
        {header.showEmail && settings?.email && <p>{settings.email}</p>}
        {header.showWebsite && settings?.website && <p>{settings.website}</p>}
        {header.showBranch && invoice.branchId && (
          <p>Branch: {String(invoice.branchId).toUpperCase()}</p>
        )}
        {header.showGst && header.gstNumber && <p>GSTIN: {header.gstNumber}</p>}
        {header.customText && <p>{header.customText}</p>}
      </div>
      <div className="receipt-meta">
        <div>
          <span>Invoice #</span>
          <span>{invoice.invoiceNumber}</span>
        </div>
        <div>
          <span>Date</span>
          <span>{formatDateTime(invoice.createdAt || Date.now())}</span>
        </div>
        {(invoice.customer?.name || invoice.customer?.phone) && (
          <div>
            <span>Customer</span>
            <span>
              {invoice.customer.name}
              {invoice.customer.name && invoice.customer.phone ? ' — ' : ''}
              {invoice.customer.phone}
            </span>
          </div>
        )}
      </div>
      <table className="receipt-items">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label || COLUMN_FALLBACK_LABELS[col.key]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(invoice.items || []).map((item, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col.key}>{columnCell(col.key, item, currency)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-totals">
        {totals.showSubtotal && (
          <div>
            <span>Subtotal</span>
            <span>{formatCurrency(invoice.subtotal, currency)}</span>
          </div>
        )}
        {totals.showTax &&
          (hasGstSplit ? (
            <>
              <div>
                <span>SGST</span>
                <span>{formatCurrency(invoice.sgst, currency)}</span>
              </div>
              <div>
                <span>CGST</span>
                <span>{formatCurrency(invoice.cgst, currency)}</span>
              </div>
            </>
          ) : (
            <div>
              <span>Tax</span>
              <span>{formatCurrency(invoice.tax, currency)}</span>
            </div>
          ))}
        {totals.showDiscount && invoice.discount > 0 && (
          <div>
            <span>
              Discount
              {invoice.discountType === 'PERCENT' && invoice.discountValue
                ? ` (${invoice.discountValue}%)`
                : ''}
            </span>
            <span>-{formatCurrency(invoice.discount, currency)}</span>
          </div>
        )}
        {totals.showRoundOff && invoice.roundOff ? (
          <div>
            <span>Round off</span>
            <span>
              {invoice.roundOff > 0 ? '+' : ''}
              {formatCurrency(invoice.roundOff, currency)}
            </span>
          </div>
        ) : null}
        <div className="receipt-grand-total">
          <span>{totals.grandTotalLabel || 'Total'}</span>
          <span>{formatCurrency(invoice.total, currency)}</span>
        </div>
        {payment && (
          <>
            <div>
              <span>Paid via</span>
              <span>{payment.method}</span>
            </div>
            {payment.method === 'CASH' && (
              <>
                <div>
                  <span>Tendered</span>
                  <span>{formatCurrency(payment.tendered ?? payment.amount, currency)}</span>
                </div>
                <div>
                  <span>Change</span>
                  <span>{formatCurrency(payment.change || 0, currency)}</span>
                </div>
              </>
            )}
            {payment.method === 'UPI' && payment.reference && (
              <div>
                <span>Reference</span>
                <span>{payment.reference}</span>
              </div>
            )}
            {payment.method === 'CARD' && (
              <>
                {payment.provider && (
                  <div>
                    <span>Terminal</span>
                    <span>{payment.provider}</span>
                  </div>
                )}
                {payment.cardDetails?.maskedPan && (
                  <div>
                    <span>Card</span>
                    <span>{payment.cardDetails.maskedPan}</span>
                  </div>
                )}
                {payment.cardDetails?.authCode && (
                  <div>
                    <span>Auth Code</span>
                    <span>{payment.cardDetails.authCode}</span>
                  </div>
                )}
                {payment.reference && (
                  <div>
                    <span>Reference</span>
                    <span>{payment.reference}</span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {footer.show && (
        <div className="receipt-footer">
          <p>{footerText}</p>
        </div>
      )}
    </div>
  )
}
