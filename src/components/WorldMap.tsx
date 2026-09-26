'use client'

import { useEffect, useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography, Graticule, Marker, ZoomableGroup } from 'react-simple-maps'
import type { GeographiesProps } from 'react-simple-maps'
import { useI18n } from '@/i18n/LocaleProvider'

const GEO_URL = '/maps/world-110m.json'
const INITIAL_VIEW = { coords: [10, 18] as [number, number], zoom: 1 }

export interface MapLocation {
  id: number
  country: string
  countryFa: string
  flag: string
  lat: number
  lng: number
  city: string
}

interface WorldMapProps {
  locations: MapLocation[]
  selectedLocationId?: number | null
  onSelectLocation?: (location: MapLocation) => void
}

export default function WorldMap({ locations, selectedLocationId, onSelectLocation }: WorldMapProps) {
  const { locale } = useI18n()
  const fa = locale === 'fa'
  const [hover, setHover] = useState<MapLocation | null>(null)
  const [localSelection, setLocalSelection] = useState<number | null>(null)
  const [center, setCenter] = useState(INITIAL_VIEW)
  const [geography, setGeography] = useState<GeographiesProps['geography'] | null>(null)
  const [mapError, setMapError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const validLocations = useMemo(() => locations.filter((location) => (
    Number.isFinite(location.lat) && Number.isFinite(location.lng)
    && Math.abs(location.lat) <= 90 && Math.abs(location.lng) <= 180
  )), [locations])
  const activeId = selectedLocationId === undefined ? localSelection : selectedLocationId
  const selected = validLocations.find((location) => location.id === activeId)
  const tooltip = hover && validLocations.some((location) => location.id === hover.id) ? hover : selected

  useEffect(() => {
    const controller = new AbortController()
    setMapError(false)
    fetch(GEO_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Map unavailable')
        return response.json()
      })
      .then((data: Record<string, unknown>) => {
        if (data.type !== 'Topology' || !data.objects) throw new Error('Invalid map')
        setGeography(data as unknown as GeographiesProps['geography'])
      })
      .catch(() => {
        if (!controller.signal.aborted) setMapError(true)
      })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    if (selected) setCenter({ coords: [selected.lng, selected.lat], zoom: 2.3 })
  }, [selected?.id, selected?.lat, selected?.lng])

  function select(location: MapLocation) {
    setLocalSelection(location.id)
    onSelectLocation?.(location)
    setCenter({ coords: [location.lng, location.lat], zoom: 2.3 })
  }

  return (
    <div className="world-map" role="region" aria-label={fa ? 'نقشه موقعیت‌های شبکه' : 'Network coverage map'}>
      <div className="map-globe-frame">
        {!geography ? (
          <div className="world-map-message" role="status">
            <span>{mapError ? (fa ? 'بارگذاری نقشه انجام نشد.' : 'The map could not be loaded.') : (fa ? 'در حال آماده‌سازی نقشه…' : 'Preparing the map…')}</span>
            {mapError ? <button type="button" className="badge badge-gray" onClick={() => setAttempt((value) => value + 1)}>{fa ? 'تلاش دوباره' : 'Try again'}</button> : null}
          </div>
        ) : (
          <ComposableMap
            width={800}
            height={450}
            projection="geoEqualEarth"
            projectionConfig={{ scale: 147, rotate: [-10, 0, 0] }}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            aria-label={fa ? 'برای مشاهده جزئیات، یک موقعیت را انتخاب کنید' : 'Select a location to view its details'}
          >
            <ZoomableGroup
              zoom={center.zoom}
              center={center.coords}
              minZoom={1}
              maxZoom={6}
              filterZoomEvent={(event) => !('type' in event && (event.type === 'wheel' || event.type === 'dblclick'))}
              onMoveEnd={({ coordinates, zoom }) => {
                setCenter((current) => ({
                  coords: coordinates ?? current.coords,
                  zoom: zoom ?? current.zoom,
                }))
              }}
            >
              <Graticule stroke="var(--map-border)" strokeWidth={0.35} opacity={0.5} />
              <Geographies geography={geography}>
                {({ geographies }) => geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="var(--map-land)"
                    stroke="var(--map-border)"
                    strokeWidth={0.55}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="world-map-geography"
                    style={{ outline: 'none' }}
                  />
                ))}
              </Geographies>
              {validLocations.map((location) => {
                const isSelected = location.id === activeId
                const country = fa && location.countryFa ? location.countryFa : location.country
                return (
                  <Marker
                    key={location.id}
                    coordinates={[location.lng, location.lat]}
                    className={`world-map-marker${isSelected ? ' is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`${country}${location.city ? `, ${location.city}` : ''}`}
                    aria-pressed={isSelected}
                    onMouseEnter={() => setHover(location)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(location)}
                    onBlur={() => setHover(null)}
                    onClick={() => select(location)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        select(location)
                      }
                    }}
                  >
                    <title>{`${country}${location.city ? ` · ${location.city}` : ''}`}</title>
                    <circle className="world-map-marker-hit" r={12 / center.zoom} fill="transparent" />
                    <circle className="world-map-marker-ring" r={(isSelected ? 10 : 6) / center.zoom} fill="var(--primary)" opacity={isSelected ? 0.25 : 0.1} stroke="var(--primary)" strokeWidth={1 / center.zoom} />
                    <circle r={(isSelected ? 4 : 2.7) / center.zoom} fill={isSelected ? '#fff' : 'var(--primary)'} />
                  </Marker>
                )
              })}
            </ZoomableGroup>
          </ComposableMap>
        )}

        {tooltip && geography ? (
          <div className="map-tooltip">
            <span aria-hidden="true">{tooltip.flag}</span>{' '}
            <b>{fa && tooltip.countryFa ? tooltip.countryFa : tooltip.country}</b>
            {tooltip.city ? <span className="muted"> — {tooltip.city}</span> : null}
          </div>
        ) : null}

        {geography ? (
          <div className="map-controls" aria-label={fa ? 'کنترل نقشه' : 'Map controls'}>
            <button type="button" className="badge badge-gray" onClick={() => setCenter(INITIAL_VIEW)} aria-label={fa ? 'نمایش کل نقشه' : 'Reset map view'} title={fa ? 'نمایش کل نقشه' : 'Reset map view'}>↺</button>
            <button type="button" className="badge badge-gray" disabled={center.zoom >= 6} onClick={() => setCenter((current) => ({ ...current, zoom: Math.min(6, current.zoom * 1.5) }))} aria-label={fa ? 'بزرگ‌نمایی نقشه' : 'Zoom in'}>＋</button>
            <button type="button" className="badge badge-gray" disabled={center.zoom <= 1} onClick={() => setCenter((current) => ({ ...current, zoom: Math.max(1, current.zoom / 1.5) }))} aria-label={fa ? 'کوچک‌نمایی نقشه' : 'Zoom out'}>−</button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
