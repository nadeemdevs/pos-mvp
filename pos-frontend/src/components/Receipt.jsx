import { formatCurrency, formatDateTime } from '../utils/format'

export default function Receipt({ invoice, payment, settings }) {
  if (!invoice) return null
  const currency = settings?.currency || 'INR'

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
        {invoice.customer?.name && (
          <div>
            <span>Customer</span>
            <span>{invoice.customer.name}</span>
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
        <div>
          <span>Tax</span>
          <span>{formatCurrency(invoice.tax, currency)}</span>
        </div>
        {invoice.discount > 0 && (
          <div>
            <span>Discount</span>
            <span>-{formatCurrency(invoice.discount, currency)}</span>
          </div>
        )}
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
                  <span>{formatCurrency(payment.amount, currency)}</span>
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
          </>
        )}
      </div>
      <div className="receipt-footer">
        <p>{settings?.receiptFooter || 'Thank you for visiting!'}</p>
      </div>
    </div>
  )
}
