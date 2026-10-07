export const PALETTE = ['#2b4cff', '#e0477a', '#11a3a0', '#f08c1a', '#7a4ee0', '#1f9d63', '#d23c4b', '#0b7fbf', '#8a6b3d', '#5c6178']

export const initials = p => ((p?.display_name || p?.username || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase()
