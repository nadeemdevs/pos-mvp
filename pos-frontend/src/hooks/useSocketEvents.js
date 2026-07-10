import { useEffect, useRef } from 'react'
import { getSocket } from '../services/socket'

// Subscribes to a map of { eventName: handler } on the shared socket for the
// lifetime of the calling component. The standard usage across this app is
// to pass handlers that invalidate the relevant TanStack Query keys (cheap,
// reliable) rather than doing manual cache surgery, e.g.:
//
//   useSocketEvents({
//     'table.updated': () => queryClient.invalidateQueries({ queryKey: ['tables'] }),
//   })
//
// Handlers are read through a ref so callers can pass a fresh inline object
// every render without tearing down/re-adding the socket listeners — only a
// change to the *set* of event names (or the socket becoming available)
// triggers a resubscribe.
export function useSocketEvents(handlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  const eventNames = Object.keys(handlers || {})
  const eventKey = eventNames.join(',')

  useEffect(() => {
    const socket = getSocket()
    if (!socket) return undefined

    const wrapped = {}
    eventNames.forEach((event) => {
      wrapped[event] = (...args) => handlersRef.current?.[event]?.(...args)
      socket.on(event, wrapped[event])
    })

    return () => {
      eventNames.forEach((event) => socket.off(event, wrapped[event]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventKey])
}
