// Two palettes, the desktop's dark and light themes, in Claude's own neutral greys.
// Soft, desaturated tones that sit with Claude's greys rather than shout.
// Limits are green while usage is low, then turn smoothly to yellow and on to red;
// the context stays grey until it matters.
export type Palette = {
  /** the base grey: muted text, a bar at low usage, the forecast tick on track */
  muted: string; green: string; yellow: string; red: string; free: string; buffer: string; track: string
  /** the forecast tick on track: apart from the grey fill it may sit right beside */
  tick: string
  palette: string[]; named: Record<string, string>; switchOff: string; switchOn: string; compactLit: string
  /** the history's chat colours: no yellow, orange or red (the limit ramp's), neighbours far apart in hue */
  chats: string[]
}

export const DARK: Palette = {
  muted: '#9b9a96', green: '#8fb08a', yellow: '#d6b36e', red: '#d47a6f',
  free: '#333332', buffer: '#4d4d4a', track: '#333332', tick: '#dcdbd6',
  palette: ['#a78bfa', '#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#fb923c', '#22d3ee', '#c084fc'],
  named: {
    Tools: '#a78bfa', Other: '#9b9a96', 'System prompt': '#a78bfa', 'System tools': '#60a5fa', 'MCP tools': '#f472b6',
    'Custom agents': '#34d399', 'Memory files': '#fbbf24', Skills: '#fb923c', Messages: '#22d3ee',
  },
  switchOff: '#4d4d4a', switchOn: '#4ade80', compactLit: '#555553',
  chats: ['#60a5fa', '#f472b6', '#4ade80', '#a78bfa', '#22d3ee', '#a3e635', '#e879f9', '#2dd4bf'],
}

// light: the same hues, deep enough to read as text on the pale band; the tracks pale
export const LIGHT: Palette = {
  muted: '#73726c', green: '#5a8a5f', yellow: '#a9822c', red: '#b85a4f',
  free: '#ffffff', buffer: '#c4c3be', track: '#ffffff', tick: '#3d3c38',
  palette: ['#8b5cf6', '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#f97316', '#0ea5e9', '#a855f7'],
  named: {
    Tools: '#8b5cf6', Other: '#73726c', 'System prompt': '#8b5cf6', 'System tools': '#3b82f6', 'MCP tools': '#ec4899',
    'Custom agents': '#10b981', 'Memory files': '#f59e0b', Skills: '#f97316', Messages: '#0ea5e9',
  },
  switchOff: '#c4c3be', switchOn: '#22c55e', compactLit: '#dddcd7',
  chats: ['#2563eb', '#db2777', '#16a34a', '#7c3aed', '#0891b2', '#65a30d', '#c026d3', '#0d9488'],
}

// each chat's colour, the same in every window: its id hashed to a slot, the next free one when
// another chat holds it. Given newest first, so the chats of recent windows are the ones apart
// (with more chats than colours, the oldest share)
export function chatColors(chats: string[], c: Palette): Map<string, string> {
  const n = c.chats.length
  const taken = new Set<number>()
  return new Map(chats.map(chat => {
    let slot = [...chat].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261) % n
    for (let i = 0; i < n && taken.has(slot); i++) slot = (slot + 1) % n
    taken.add(slot)
    return [chat, c.chats[slot]!] as const
  }))
}

/** `low` (grey, or green for the limits) up to the first %, fully yellow at the second, fully red at the third */
export type Ramp = readonly [number, number, number]
export const LIMIT_RAMP: Ramp = [60, 70, 85]
export const CONTEXT_RAMP: Ramp = [25, 50, 80]

const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

export function mix(a: string, b: string, t: number): string {
  const [x, y] = [channels(a), channels(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')
}

// by the % as the band shows it (rounded), so a "75%" is always the same colour
export function rampColor(percent: number, [from, mid, to]: Ramp, c: Palette, low: string = c.muted): string {
  const p = Math.round(percent)
  // an unreadable % (NaN) stays grey
  if (Number.isNaN(p)) return c.muted
  if (!(p > from)) return low
  if (p <= mid) return mix(low, c.yellow, (p - from) / (mid - from))
  return mix(c.yellow, c.red, Math.min(1, (p - mid) / (to - mid)))
}
