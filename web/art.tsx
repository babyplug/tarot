import type { RevealedCard } from '../domain/reading.js';

export function CardBack({ small = false }: { small?: boolean }) {
  return <svg className="card-art" viewBox="0 0 120 190" aria-hidden="true">
    <rect width="120" height="190" rx="8" fill="#244b42" />
    <rect x="7" y="7" width="106" height="176" rx="5" fill="none" stroke="#bfa575" strokeWidth=".7" />
    <path d="M60 23 101 95 60 167 19 95Z M60 40 91 95 60 150 29 95Z" fill="none" stroke="#bfa575" strokeWidth=".7" />
    <circle cx="60" cy="95" r="24" fill="none" stroke="#bfa575" />
    <path d="M60 65v60M30 95h60M39 74l42 42M39 116l42-42" stroke="#bfa575" strokeWidth=".6" />
    <circle cx="60" cy="95" r="9" fill="#bfa575" />
    <circle cx="64" cy="91" r="8" fill="#244b42" />
    {!small && <g fill="#d9c6a0">{[25, 60, 95].map(x => <g key={x}><circle cx={x} cy="17" r="1" /><circle cx={x} cy="173" r="1" /></g>)}</g>}
  </svg>;
}
function Symbol({ suit }: { suit: string | null }) {
  if (suit === 'cups') return <g><path d="M43 60h34v20c0 26-34 26-34 0Z M60 100v30M43 130h34" /><path d="M77 65h12v13c0 12-12 12-12 12" /></g>;
  if (suit === 'swords') return <g><path d="m60 42 6 14-6 65-6-65Z M40 113h40M60 113v25" /><circle cx="60" cy="141" r="4" /></g>;
  if (suit === 'wands') return <g><path d="m47 139 26-92M62 86c-18 1-20-13-20-13 18-2 20 13 20 13Zm4-15c17-1 21-16 21-16-18-1-21 16-21 16Z" /></g>;
  if (suit === 'pentacles') return <g><circle cx="60" cy="93" r="32" /><path d="m60 65 17 51-45-32h56l-45 32Z" /></g>;
  return <g><circle cx="60" cy="93" r="27" /><circle cx="68" cy="85" r="22" fill="#f8f2e6" stroke="none" /><path d="M60 45v-9M60 150v-9M13 93h10M97 93h10M27 60l-7-7M93 126l7 7M27 126l-7 7M93 60l7-7" /></g>;
}
export function CardFace({ card }: { card: RevealedCard }) {
  const palette = card.suit === 'swords' ? '#647587' : card.suit === 'cups' ? '#a05d60' : card.suit === 'wands' ? '#9c773a' : '#3d6b59';
  return <svg className={`card-art card-face ${card.orientation === 'reversed' ? 'reversed' : ''}`} viewBox="0 0 120 190" aria-hidden="true">
    <rect width="120" height="190" rx="8" fill="#f8f2e6" />
    <rect x="6" y="6" width="108" height="178" rx="5" fill="none" stroke={palette} strokeWidth=".8" />
    <text x="60" y="26" textAnchor="middle" fill={palette} fontFamily="Georgia,serif" fontSize="12">{card.rank}</text>
    <g fill="none" stroke={palette} strokeWidth="1.6"><Symbol suit={card.suit} /></g>
    <path d="M22 157h76" stroke={palette} strokeWidth=".6" />
    <text x="60" y="171" textAnchor="middle" fill={palette} fontFamily="Georgia,serif" fontSize="8">{card.suit?.toUpperCase() ?? 'MAJOR ARCANA'}</text>
    <g fill={palette}>{Array.from({ length: Math.min(card.rank % 8 + 1, 8) }, (_, i) => <circle key={i} cx={24 + i * 10} cy="148" r="1.2" />)}</g>
  </svg>;
}
