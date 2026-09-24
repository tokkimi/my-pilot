// Shared by browser and server; no UI or translation dependencies.
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const isoDateTime = (d: Date) => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
export const addDays = (days: number, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + days); return d }
