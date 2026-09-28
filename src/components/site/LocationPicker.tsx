'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { IRAN_CENTER, PROVINCE_CENTERS } from '@/modules/shipping/domain/shipping'

export type Pin = { lat: number; lng: number } | null

// Open-source map (Leaflet + OpenStreetMap tiles). A self-hosted or local
// tile server can be set with NEXT_PUBLIC_MAP_TILES ({z}/{x}/{y} template).
const TILES = process.env.NEXT_PUBLIC_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const inIran = (lat: number, lng: number) => lat >= 24 && lat <= 40.5 && lng >= 43 && lng <= 64

/**
 * Pick the delivery point on a map: click or drag the pin, or use the
 * device location. Opens on the pin, else on the chosen city (looked up
 * through /api/geo/search), else on the province capital.
 */
export default function LocationPicker({ value, onChange, province, city, street }: { value: Pin; onChange: (pin: Pin) => void; province?: string; city?: string; street?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const leaflet = useRef<typeof import('leaflet') | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('')

  // Create the map once.
  useEffect(() => {
    let cancelled = false
    void import('leaflet').then((L) => {
      if (cancelled || !box.current || map.current) return
      leaflet.current = L
      const start: [number, number] = value ? [value.lat, value.lng] : PROVINCE_CENTERS[province || ''] || IRAN_CENTER
      const created = L.map(box.current, { center: start, zoom: value ? 16 : province ? 11 : 5, zoomControl: true, attributionControl: true, scrollWheelZoom: false })
      L.tileLayer(TILES, { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>' }).addTo(created)
      created.on('click', (event) => place(event.latlng.lat, event.latlng.lng))
      created.on('focus', () => created.scrollWheelZoom.enable())
      created.on('blur', () => created.scrollWheelZoom.disable())
      map.current = created
      if (value) place(value.lat, value.lng, false)
      setReady(true)
    })
    return () => { cancelled = true; map.current?.remove(); map.current = null; marker.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function place(lat: number, lng: number, notify = true) {
    const L = leaflet.current, m = map.current
    if (!L || !m) return
    if (!inIran(lat, lng)) { setStatus('این نقطه بیرون از ایران است؛ روی آدرس خود بزنید.'); return }
    const icon = L.divIcon({ className: 'lp-pin', html: '<span></span>', iconSize: [30, 42], iconAnchor: [15, 40] })
    if (marker.current) marker.current.setLatLng([lat, lng])
    else {
      marker.current = L.marker([lat, lng], { draggable: true, icon, keyboard: true, title: 'موقعیت تحویل' }).addTo(m)
      marker.current.on('dragend', () => { const point = marker.current!.getLatLng(); place(point.lat, point.lng) })
    }
    setStatus('')
    if (notify) change.current({ lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 })
  }

  // Follow the province / city choice until a pin is placed.
  useEffect(() => {
    if (!ready || value || !map.current) return
    const m = map.current
    const center = PROVINCE_CENTERS[province || '']
    if (center) m.flyTo(center, 11, { duration: .6 })
    if (!city?.trim()) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/geo/search?province=${encodeURIComponent(province || '')}&city=${encodeURIComponent(city)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => { if (data?.center && !marker.current) m.flyTo(data.center, data.zoom || 13, { duration: .6 }) })
        .catch(() => null)
    }, 700)
    return () => { clearTimeout(timer); controller.abort() }
  }, [ready, province, city]) // eslint-disable-line react-hooks/exhaustive-deps

  function locate() {
    if (!navigator.geolocation) { setStatus('مرورگر شما موقعیت‌یابی را پشتیبانی نمی‌کند.'); return }
    setStatus('در حال یافتن موقعیت شما…')
    navigator.geolocation.getCurrentPosition(
      (position) => { const { latitude, longitude } = position.coords; map.current?.flyTo([latitude, longitude], 17, { duration: .6 }); place(latitude, longitude) },
      () => setStatus('دسترسی به موقعیت داده نشد؛ نقطه را روی نقشه انتخاب کنید.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  async function findStreet() {
    if (!street?.trim() || !map.current) return
    setStatus('در حال جست‌وجوی نشانی…')
    const response = await fetch(`/api/geo/search?province=${encodeURIComponent(province || '')}&city=${encodeURIComponent(city || '')}&q=${encodeURIComponent(street)}`).catch(() => null)
    const data = await response?.json().catch(() => null)
    if (data?.center) map.current.flyTo(data.center, data.zoom || 15, { duration: .6 })
    setStatus(data?.source === 'search' ? 'نقشه به نشانی نزدیک شد؛ پین را دقیقاً روی ساختمان بگذارید.' : 'نشانی پیدا نشد؛ پین را روی نقشه بگذارید.')
  }

  return <div className="lp">
    <div className="lp-toolbar">
      <span className="lp-hint">{value ? 'پین را برای جابه‌جایی بکشید یا جای دیگری بزنید.' : 'روی محل دقیق تحویل بزنید تا پین گذاشته شود.'}</span>
      <div className="lp-actions">
        {street?.trim() && <button type="button" className="lp-btn" onClick={() => void findStreet()}>یافتن نشانی</button>}
        <button type="button" className="lp-btn" onClick={locate}>موقعیت من</button>
        {value && <button type="button" className="lp-btn" onClick={() => { marker.current?.remove(); marker.current = null; change.current(null) }}>حذف پین</button>}
      </div>
    </div>
    <div ref={box} className="lp-map" role="application" aria-label="نقشهٔ انتخاب موقعیت تحویل" tabIndex={0} />
    <div className="lp-foot" aria-live="polite">{status || (value ? <>موقعیت ثبت شد: <bdi dir="ltr">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</bdi></> : 'انتخاب موقعیت اختیاری است اما تحویل را سریع‌تر و دقیق‌تر می‌کند.')}</div>
  </div>
}
