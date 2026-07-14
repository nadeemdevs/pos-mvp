import { formatCurrency, formatDateTime } from '../utils/format'

export default function Receipt({ invoice, payment, settings }) {
  if (!invoice) return null
  const currency = settings?.currency || 'INR'
  // sgst/cgst are only non-zero when the invoice was created while
  // settings.country was 'India' — this keeps reprints of older invoices
  // consistent even if the setting is toggled afterwards.
  const hasGstSplit = (invoice.sgst || 0) > 0 || (invoice.cgst || 0) > 0

  return (
    <div className="receipt" id="print-receipt">
      <div className="receipt-header">
        <h2>{settings?.restaurantName || 'Restaurant'}</h2>
        {settings?.address && <p>{settings.address}</p>}
        {settings?.phone && <p>{settings.phone}</p>}
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
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {(invoice.items || []).map((item, idx) => (
            <tr key={idx}>
              <td>{item.name}</td>
              <td>{item.qty}</td>
              <td>{formatCurrency(item.price, currency)}</td>
              <td>{formatCurrency(item.price * item.qty, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="receipt-totals">
        <div>
          <span>Subtotal</span>
          <span>{formatCurrency(invoice.subtotal, currency)}</span>
        </div>
        {hasGstSplit ? (
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
        )}
        {invoice.discount > 0 && (
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
        {invoice.roundOff ? (
          <div>
            <span>Round off</span>
            <span>
              {invoice.roundOff > 0 ? '+' : ''}
              {formatCurrency(invoice.roundOff, currency)}
            </span>
          </div>
        ) : null}
        <div className="receipt-grand-total">
          <span>Total</span>
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
      <div className="receipt-footer">
        <p>{settings?.receiptFooter || 'Thank you for visiting!'}</p>
      </div>
    </div>
  )
}
