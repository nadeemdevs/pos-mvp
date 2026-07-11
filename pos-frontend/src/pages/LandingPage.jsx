import { Link } from 'react-router-dom'

const FEATURES = [
  {
    title: 'Billing POS',
    text: 'Fast, keyboard-friendly billing built for busy counters.',
  },
  {
    title: 'Table & Kitchen',
    text: 'Live table status and a kitchen display that keeps up.',
  },
  {
    title: 'Inventory',
    text: 'Track stock and purchasing without the spreadsheets.',
  },
  {
    title: 'Analytics',
    text: 'Sales, trends and staff performance at a glance.',
  },
]

export default function LandingPage() {
  return (
    <div className="landing-page">
      <main className="landing-hero">
        <div className="landing-wordmark">
          Serve<span>OS</span>
        </div>
        <h1 className="landing-headline">
          The modern restaurant POS — coming soon
        </h1>
        <p className="landing-subtext">
          Billing, tables, kitchen, inventory and analytics — one system for
          your restaurant.
        </p>

        <div className="landing-actions">
          <Link to="/login" className="btn btn-ghost landing-btn">
            Sign in
          </Link>
          <Link to="/signup" className="btn btn-primary landing-btn">
            Create your restaurant
          </Link>
        </div>

        <div className="landing-features">
          {FEATURES.map((f) => (
            <div className="landing-feature-card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="landing-footer">© 2026 ServeOS</footer>
    </div>
  )
}
