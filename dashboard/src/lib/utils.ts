import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Level } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Level → badge classes, shared by the topics list and session touch cards.
export const LEVEL_TAG: Record<Level, string> = {
  beginner:  'bg-[#1e293b] text-[#94a3b8]',
  junior:    'bg-[#1e3a2f] text-[#4ade80]',
  middle:    'bg-[#1c2d4a] text-[#60a5fa]',
  senior:    'bg-[#3b1f4e] text-[#c4b5fd]',
  principal: 'bg-[#431407] text-[#fb923c]',
}

const SCORE_BORDERS = ['#374151', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function scoreBorderColor(score: number) {
  return SCORE_BORDERS[Math.max(0, Math.min(5, score))]
}

export function scoreGradient(score: number) {
  const s = Math.max(0, Math.min(5, score))
  if (s === 0) return SCORE_BORDERS[0]
  if (s === 1) return SCORE_BORDERS[1]
  const stops = Array.from({ length: s }, (_, i) =>
    `${SCORE_BORDERS[i + 1]} ${((i / (s - 1)) * 100).toFixed(1)}%`
  )
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

export function heatmapColor(count: number) {
  if (!count) return '#21262d'
  if (count <= 2) return '#4a044e'
  if (count <= 4) return '#86198f'
  if (count <= 6) return '#c026d3'
  if (count <= 9) return '#d946ef'
  return '#e879f9'
}

export function formatDate(dateStr: string) {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${MONTH_SHORT[m - 1]} ${d}`
}

export function formatDateTime(isoStr: string) {
  const d = new Date(isoStr)
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()} · ${h}:${min}`
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatMethod(m: string) {
  return m.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Sum of gaps between sorted event timestamps (epoch ms), each gap capped at capMin.
// Idle time beyond the cap is discarded, so abandoned sessions can't inflate the total.
export function activeMinutes(events: number[], capMin = 30): number {
  const sorted = [...events].sort((a, b) => a - b)
  const cap = capMin * 60000
  let ms = 0
  for (let i = 1; i < sorted.length; i++) ms += Math.min(sorted[i] - sorted[i - 1], cap)
  return Math.round(ms / 60000)
}

export function formatMinutes(mins: number): string {
  if (mins < 1) return '< 1m'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
