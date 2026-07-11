import axios from 'axios'

// Dedicated axios instance for the public QR-ordering surface (/qr/:qrToken).
// These endpoints are unauthenticated by design, so this instance deliberately
// carries none of the interceptors from services/api.js — no bearer token,
// no 401-triggered redirect to /login (a guest browsing the menu must never
// be bounced to the staff login screen).
const publicApi = axios.create({
  baseURL: '/api',
})

export default publicApi
