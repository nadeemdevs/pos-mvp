import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useReveal } from '../hooks/useReveal'

import billingIllustration from '../assets/illustrations/billing.svg'
import kitchenIllustration from '../assets/illustrations/kitchen.svg'
import inventoryIllustration from '../assets/illustrations/inventory.svg'
import loyaltyIllustration from '../assets/illustrations/loyalty.svg'
import qrIllustration from '../assets/illustrations/qr.svg'
import analyticsIllustration from '../assets/illustrations/analytics.svg'

// lucide-react has no brand/social marks — these are minimal, recognizable
// stand-ins for the real logos rather than unrelated generic icons (an
// at-sign/briefcase/camera would misrepresent Twitter/LinkedIn/Instagram).
function IconX(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M18.24 2H21l-6.6 7.54L22 22h-6.2l-4.86-6.36L5.3 22H2.53l7.06-8.07L2 2h6.35l4.4 5.82L18.24 2Zm-1.09 18h1.53L7.03 3.9H5.38L17.15 20Z" />
    </svg>
  )
}
function IconLinkedIn(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.6c0-1.34-.02-3.06-1.87-3.06-1.87 0-2.16 1.46-2.16 2.96V21h-4V9Z" />
    </svg>
  )
}
function IconInstagram(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const FEATURES = [
  {
    illustration: billingIllustration,
    title: 'Billing & POS',
    text: 'Fast, keyboard-friendly billing built for busy counters — cash, UPI, and card in one flow.',
  },
  {
    illustration: kitchenIllustration,
    title: 'Tables & Kitchen',
    text: 'Live table status and a kitchen display system that keeps every order moving.',
  },
  {
    illustration: inventoryIllustration,
    title: 'Inventory & Purchasing',
    text: 'Track stock, recipes, and vendor purchase orders without a spreadsheet in sight.',
  },
  {
    illustration: loyaltyIllustration,
    title: 'Loyalty & CRM',
    text: 'Reward regulars automatically and keep a full history of every customer.',
  },
  {
    illustration: qrIllustration,
    title: 'QR & Online Ordering',
    text: 'Guests scan a table code and order straight into your kitchen — no app required.',
  },
  {
    illustration: analyticsIllustration,
    title: 'Analytics & Reports',
    text: 'Revenue, food cost, and peak-hour insights, updated in real time.',
  },
]

const FAQS = [
  {
    q: 'Do I need special hardware to get started?',
    a: "No. ServeOS runs in any browser. When you're ready, it also supports standard ESC/POS receipt and kitchen printers over your network.",
  },
  {
    q: 'Can I run multiple restaurant branches from one account?',
    a: 'Yes. Add branches anytime and switch between them, or view combined reports across all of them at once.',
  },
  {
    q: "Is my restaurant's data isolated from other restaurants on the platform?",
    a: 'Completely. Every restaurant gets its own fully isolated workspace — data, staff accounts, and settings never cross over.',
  },
  {
    q: 'What if I only need billing, not the full system?',
    a: 'Turn on exactly what you need from Settings — billing alone, or the full dine-in and inventory suite — anytime, without switching plans.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes — create your restaurant and start using ServeOS immediately, no credit card required.',
  },
  {
    q: 'Do you offer support if I get stuck?',
    a: 'Yes, our support team is available by email to help you get set up and answer questions.',
  },
]

// Smoothly scrolls to an in-page anchor (Features / FAQ) instead of relying
// on global CSS `scroll-behavior: smooth`, which would also apply to normal
// mouse-wheel scrolling. `scroll-margin-top` on `.landing-section` already
// keeps the sticky navbar from covering the heading.
function scrollToAnchor(event, id) {
  const el = document.getElementById(id)
  if (!el) return
  event.preventDefault()
  el.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  })
}

// Wraps any element/section so it fades + slides in once scrolled into view.
// A tiny wrapper component (rather than calling useReveal inline in a loop)
// so each instance gets its own IntersectionObserver via its own hook call.
function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }) {
  const ref = useReveal()
  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  )
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`landing-navbar ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="landing-navbar-inner">
        <div className="landing-wordmark">
          Serve<span>OS</span>
        </div>
        <nav className="landing-navbar-actions">
          <Link to="/login" className="btn btn-ghost">
            Login
          </Link>
          <Link to="/signup" className="btn btn-primary">
            Get Started
          </Link>
        </nav>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="landing-hero">
      <Reveal className="landing-hero-inner">
        <h1 className="landing-headline">
          Run your restaurant on one system, not five spreadsheets.
        </h1>
        <p className="landing-subtext">
          Billing, tables, kitchen, inventory, and loyalty — ServeOS brings
          your entire restaurant into one clean dashboard. Turn on only what
          you need, from day one.
        </p>
        <div className="landing-actions">
          <Link to="/signup" className="btn btn-primary landing-btn">
            Get Started Free
          </Link>
          <a
            href="#features"
            className="btn btn-ghost landing-btn"
            onClick={(e) => scrollToAnchor(e, 'features')}
          >
            See features
          </a>
        </div>
      </Reveal>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="landing-section">
      <Reveal as="div" className="landing-section-heading">
        <h2>Everything your restaurant needs, in one place</h2>
        <p>Turn on the modules you need today — add the rest whenever you're ready.</p>
      </Reveal>
      <div className="landing-bento">
        {FEATURES.map((f, i) => (
          <Reveal
            key={f.title}
            as="article"
            className={`landing-bento-card landing-bento-card--${i}`}
            delay={i * 70}
          >
            <div className="landing-bento-content">
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
            <img src={f.illustration} alt="" className="landing-bento-illustration" aria-hidden="true" />
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function FaqItem({ item, isOpen, onToggle, index }) {
  return (
    <div className="landing-faq-item">
      <h3 className="landing-faq-question-row">
        <button
          type="button"
          className="landing-faq-trigger"
          aria-expanded={isOpen}
          aria-controls={`faq-panel-${index}`}
          id={`faq-trigger-${index}`}
          onClick={onToggle}
        >
          <span>{item.q}</span>
          <ChevronDown
            size={20}
            className={`landing-faq-chevron ${isOpen ? 'is-open' : ''}`}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div
        id={`faq-panel-${index}`}
        role="region"
        aria-labelledby={`faq-trigger-${index}`}
        className={`landing-faq-panel ${isOpen ? 'is-open' : ''}`}
      >
        <p className="landing-faq-answer">{item.a}</p>
      </div>
    </div>
  )
}

function Faq() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section id="faq" className="landing-section">
      <Reveal as="div" className="landing-section-heading">
        <h2>Frequently asked questions</h2>
        <p>Can't find what you're looking for? Reach out and we'll help.</p>
      </Reveal>
      <Reveal as="div" className="landing-faq">
        {FAQS.map((item, i) => (
          <FaqItem
            key={item.q}
            item={item}
            index={i}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex((cur) => (cur === i ? null : i))}
          />
        ))}
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="landing-footer">
      <Reveal as="div" className="landing-footer-inner">
        <div className="landing-footer-brand">
          <div className="landing-wordmark">
            Serve<span>OS</span>
          </div>
          <p>The all-in-one operating system for modern restaurants.</p>
          <div className="landing-footer-social">
            <a href="#" aria-label="Twitter / X">
              <IconX />
            </a>
            <a href="#" aria-label="LinkedIn">
              <IconLinkedIn />
            </a>
            <a href="#" aria-label="Instagram">
              <IconInstagram />
            </a>
          </div>
        </div>

        <div className="landing-footer-col">
          <h4>Product</h4>
          <a href="#features" onClick={(e) => scrollToAnchor(e, 'features')}>
            Features
          </a>
          <a href="#faq" onClick={(e) => scrollToAnchor(e, 'faq')}>
            FAQ
          </a>
        </div>

        <div className="landing-footer-col">
          <h4>Company</h4>
          <a href="#">About</a>
          <a href="#">Contact</a>
        </div>

        <div className="landing-footer-col">
          <h4>Legal</h4>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
        </div>
      </Reveal>
      <div className="landing-footer-bottom">© 2026 ServeOS</div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="landing-page">
      <Navbar />
      <Hero />
      <Features />
      <Faq />
      <Footer />
    </div>
  )
}
