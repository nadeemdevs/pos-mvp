import { useEffect, useRef } from 'react'

// Adds an `.is-visible` class to the element once it scrolls into view, so
// CSS can animate it in (opacity/translateY). Uses IntersectionObserver
// rather than a scroll listener so it's cheap and passive. The class is
// added once and never removed — reveals shouldn't replay on scroll-back.
export function useReveal(options) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    // Respect reduced-motion users at the JS level too: just mark it visible
    // immediately instead of waiting on the observer (CSS also guards this,
    // this just avoids a pointless observer for those users).
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-visible')
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px', ...options }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [options])

  return ref
}
