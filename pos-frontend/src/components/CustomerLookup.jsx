import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCustomers } from '../services/customerService'
import { useDebouncedValue } from '../hooks/useDebouncedValue'

// Phone-first customer lookup: typing a phone number searches existing
// customers and offers a dropdown of matches, or a new customer is created
// implicitly from the typed name/phone. Shared by BillingPage (cart
// customer) and ReservationsPage (reservation customer).
export default function CustomerLookup({ customer, onFieldChange, onSelect, onClear }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const phone = customer?.phone || ''
  const name = customer?.name || ''
  const debouncedPhone = useDebouncedValue(phone, 300)
  const trimmedPhone = debouncedPhone.trim()

  const { data } = useQuery({
    queryKey: ['customers', 'lookup', trimmedPhone],
    queryFn: () => getCustomers({ search: trimmedPhone, limit: 6 }),
    enabled: trimmedPhone.length >= 3,
  })
  const matches = Array.isArray(data) ? data : data?.items || []
  const exactMatch = matches.some((c) => c.phone === phone)
  const hasDetails = phone.trim().length > 0 || name.trim().length > 0

  const handlePhoneChange = (value) => {
    onFieldChange({ ...customer, phone: value })
    setDropdownOpen(value.trim().length >= 3)
  }

  const handleSelect = (c) => {
    onSelect({ name: c.name, phone: c.phone })
    setDropdownOpen(false)
  }

  return (
    <div>
      <div className="field-row customer-lookup-row">
        <label className="field customer-lookup">
          <span>Phone</span>
          <input
            value={phone}
            placeholder="Search or enter phone"
            onChange={(e) => handlePhoneChange(e.target.value)}
            onFocus={() => setDropdownOpen(phone.trim().length >= 3)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          />
          {dropdownOpen && matches.length > 0 && (
            <div className="customer-lookup-dropdown">
              {matches.map((c) => (
                <button
                  type="button"
                  key={c._id || c.id}
                  className="customer-lookup-item"
                  onMouseDown={() => handleSelect(c)}
                >
                  <span>{c.name}</span>
                  <span className="customer-lookup-item-phone">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="field">
          <span>Customer Name</span>
          <input
            value={name}
            onChange={(e) => onFieldChange({ ...customer, name: e.target.value })}
          />
        </label>
        {hasDetails && (
          <button
            type="button"
            className="customer-clear-btn"
            title="Remove customer"
            aria-label="Remove customer"
            onClick={onClear}
          >
            ×
          </button>
        )}
      </div>
      {hasDetails && !exactMatch && (
        <p className="customer-hint">New customer will be saved</p>
      )}
    </div>
  )
}
