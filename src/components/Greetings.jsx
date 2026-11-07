import { useEffect, useState } from 'react'
import { MORE_FACES, MoreStage, SeasonBurst, SeasonStar } from './GreetingsMore'
import Sheet from './Sheet'
import { stillPlease } from '../lib/feedback'
import { effectSound, unlockAudio } from '../lib/sounds'

// Seasonal greetings, as in Plait's Messages: characters of Hugpix's own,
// each with its own sound (lib/sounds.js, effectSound), a set to each
// season with them:
//   Christmas     a gingerbread runner dashing across, a penguin in a scarf
//                 sliding past on its belly, a snowman rising to wave, a
//                 present popping its lid, a flurry of snow with sleigh bells;
//   Halloween     a friendly ghost floating up to say boo, a flock of bats
//                 swooping past, a jack-o'-lantern lit by a flash of
//                 lightning, a spider dropping on its thread;
//   Thanksgiving  a turkey strutting across, a gust of autumn leaves, a
//                 pumpkin pie with the steam rising and glasses clinking, a
//                 squirrel scampering by with an acorn.
// And more (Kerry: "i want more holiday greeting for each theme", drawn in
// GreetingsMore.jsx): Santa's sleigh, a reindeer and a lit tree; a witch, a
// black cat and a shower of candy; a horn of plenty, a scarecrow and falling
// acorns; and sets for New Year (a clock striking midnight, champagne,
// confetti, gold fireworks) and the Fourth of July (fireworks, the flag, an
// eagle, a sparkler).
// Sent in a message, or as a reaction to a photo, while that season is on;
// played across the whole screen for whoever sees it, whatever their season
// (GreetingStage, through playGreeting). With reduced motion asked for, the
// character only fades in and out where it stands.

export const GREETINGS = {
  holiday: [
    { kind: 'gingerbread', label: 'Gingerbread dash' },
    { kind: 'penguin', label: 'Penguin slide' },
    { kind: 'snowman', label: 'Snowman wave' },
    { kind: 'gift', label: 'Gift pop' },
    { kind: 'flurry', label: 'Snow flurry' },
    { kind: 'sleigh', label: 'Sleigh ride' },
    { kind: 'reindeer', label: 'Reindeer hop' },
    { kind: 'tree', label: 'Tree lights' },
  ],
  halloween: [
    { kind: 'ghost', label: 'Ghost boo' },
    { kind: 'bats', label: 'Bat swoop' },
    { kind: 'pumpkin', label: 'Pumpkin flash' },
    { kind: 'spider', label: 'Spider drop' },
    { kind: 'witch', label: 'Witch flyby' },
    { kind: 'cat', label: 'Black cat' },
    { kind: 'candy', label: 'Candy shower' },
  ],
  thanksgiving: [
    { kind: 'turkey', label: 'Turkey strut' },
    { kind: 'leaves', label: 'Leaf gust' },
    { kind: 'pie', label: 'Pie time' },
    { kind: 'squirrel', label: 'Squirrel dash' },
    { kind: 'harvest', label: 'Horn of plenty' },
    { kind: 'scarecrow', label: 'Scarecrow wave' },
    { kind: 'acorns', label: 'Acorn drop' },
  ],
  newyear: [
    { kind: 'midnight', label: 'Midnight' },
    { kind: 'champagne', label: 'Champagne pop' },
    { kind: 'confetti', label: 'Confetti cannon' },
    { kind: 'goldworks', label: 'Gold fireworks' },
  ],
  july4: [
    { kind: 'fireworks', label: 'Fireworks' },
    { kind: 'flag', label: 'Flag wave' },
    { kind: 'eagle', label: 'Eagle soar' },
    { kind: 'sparkler', label: 'Sparkler' },
  ],
}
const SEASON_NAME = { holiday: 'Christmas', halloween: 'Halloween', thanksgiving: 'Thanksgiving', newyear: 'New Year', july4: 'Fourth of July' }
const ALL = Object.values(GREETINGS).flat()
export const isGreeting = (kind) => ALL.some((g) => g.kind === kind)
export const greetingLabel = (kind) => ALL.find((g) => g.kind === kind)?.label ?? 'Greeting'

// Hugpix's season (lib/theme.js) as a set of greetings, or null outside them.
// `more` is whether the database takes the later greetings (the "moreGreetings"
// switch): without it, only the first ones are offered, and New Year and the
// Fourth of July have none.
export const greetingSeason = (season, more = false) => {
  const set = season === 'christmas' ? 'holiday' : GREETINGS[season] && season !== 'holiday' ? season : null
  return set && (more || greetingsOf(set, false).length) ? set : null
}
// A season's greetings, the later ones only when `more`.
export const greetingsOf = (set, more) => (GREETINGS[set] ?? []).filter((g) => more || !MORE_FACES[g.kind])

// How long each plays, in ms.
const LONG = {
  gingerbread: 3000, penguin: 3000, snowman: 3300, gift: 2600, flurry: 3600,
  ghost: 3000, bats: 3000, pumpkin: 2800, spider: 3300,
  turkey: 3800, leaves: 3200, pie: 2800, squirrel: 3200,
  sleigh: 3800, reindeer: 3200, tree: 3200, witch: 3600, cat: 3000, candy: 3200,
  harvest: 3000, scarecrow: 3300, acorns: 3000, midnight: 3400, champagne: 3000,
  confetti: 3000, goldworks: 3400, fireworks: 3600, flag: 3200, eagle: 3400, sparkler: 3200,
}

// ---------- the characters ----------

const ICING = '#fff8ef'

function Gingerbread({ size = 72 }) {
  const dough = '#b8692f'
  return (
    <svg viewBox="0 0 40 48" width={size} height={size * 1.2} aria-hidden="true">
      <g stroke={dough} strokeWidth="7" strokeLinecap="round">
        <path className="gb-limb gb-a" d="M16 31 11 43" />
        <path className="gb-limb gb-b" d="M24 31 29 43" />
        <path className="gb-limb gb-b" d="M14 20 6 26" />
        <path className="gb-limb gb-a" d="M26 20 34 14" />
      </g>
      <ellipse cx="20" cy="25" rx="8.5" ry="10" fill={dough} />
      <circle cx="20" cy="10" r="8" fill={dough} />
      <g stroke={ICING} strokeWidth="1.3" fill="none" strokeLinecap="round">
        <path d="M9 41.5l1.2 1.4 1.2-1.4 1.2 1.4" />
        <path d="M27.4 41.5l1.2 1.4 1.2-1.4 1.2 1.4" />
        <path d="M5 24.6l1.4 1.2 1.2-1.6" />
        <path d="M32.8 12.6l1 1.6 1.6-1" />
        <path d="M16.6 12.6q3.4 3 6.8 0" />
      </g>
      <circle cx="17" cy="8.6" r="1.25" fill="#3b2412" />
      <circle cx="23" cy="8.6" r="1.25" fill="#3b2412" />
      <circle cx="14.6" cy="11.6" r="1.3" fill="#e9887a" opacity=".8" />
      <circle cx="25.4" cy="11.6" r="1.3" fill="#e9887a" opacity=".8" />
      <circle cx="20" cy="21.5" r="1.9" fill="#e23434" />
      <circle cx="20" cy="27" r="1.9" fill="#2fae5f" />
    </svg>
  )
}

function Penguin({ size = 96 }) {
  return (
    <svg viewBox="0 0 64 34" width={size} height={size * 0.53} aria-hidden="true">
      <g className="pg-spray" fill="#eaf4ff">
        <circle cx="60" cy="27" r="1.6" /><circle cx="63" cy="24" r="1.1" /><circle cx="58" cy="31" r="1.2" />
      </g>
      <ellipse cx="54.5" cy="26" rx="3.4" ry="1.8" fill="#f39a2b" />
      <ellipse cx="34" cy="20" rx="22" ry="10" fill="#1f2430" />
      <ellipse cx="33" cy="24.5" rx="17" ry="5.6" fill="#f4f6fb" />
      <path d="M30 14C38 13 46 15 50 19 44 18 37 18 30 17Z" fill="#161a23" />
      <circle cx="13" cy="16" r="8.2" fill="#1f2430" />
      <circle cx="11.6" cy="17.4" r="4.8" fill="#f4f6fb" />
      <circle cx="10" cy="15.4" r="1.3" fill="#1f2430" />
      <path d="M5 16.4 0.6 18 5 19.8Z" fill="#f39a2b" />
      <path className="pg-scarf" d="M21 22C27 21 31 17 37 14 35 18 33 20 30 22 33 21 35 22 37 21 33 24 27 25 21 25Z" fill="#e23434" />
      <path d="M18 18.5C20 22 23 23.5 24.5 23.2L23.6 25.6C20.6 25.6 17.6 23 16.6 20.6Z" fill="#e23434" />
      <path d="M19.6 21.6l1.4-.4M21.6 23l1.2-.6" stroke="#fff" strokeWidth=".9" strokeLinecap="round" />
    </svg>
  )
}

function Snowman({ size = 104 }) {
  return (
    <svg viewBox="0 0 44 60" width={size} height={size * 1.36} aria-hidden="true">
      <g stroke="#6b4226" strokeWidth="1.6" strokeLinecap="round" fill="none">
        <path d="M11 37 2 30M5.4 32.6 3.6 29" />
        <g className="sm-wave"><path d="M33 37 42 26M39.4 29.4 42.6 28.6M40 28 39.6 24.6" /></g>
      </g>
      <circle cx="22" cy="44" r="14" fill="#f8fbff" stroke="#cfe0ee" strokeWidth="1" />
      <circle cx="22" cy="22.5" r="10" fill="#f8fbff" stroke="#cfe0ee" strokeWidth="1" />
      <circle cx="22" cy="40" r="1.2" fill="#3a3f4a" /><circle cx="22" cy="45" r="1.2" fill="#3a3f4a" /><circle cx="22" cy="50" r="1.2" fill="#3a3f4a" />
      <path d="M13 31C17 33.5 27 33.5 31 31L31.6 33.6C27 36 17 36 12.4 33.6Z" fill="#d42a2a" />
      <path d="M26.5 33.5 28.8 41 32 40 29.4 33Z" fill="#d42a2a" />
      <circle cx="18.6" cy="20.4" r="1.2" fill="#3a3f4a" /><circle cx="25.4" cy="20.4" r="1.2" fill="#3a3f4a" />
      <path d="M22 23.2 29.6 24.6 22 25.6Z" fill="#f39a2b" />
      <path d="M18.4 27.2q3.6 2.4 7.2 0" stroke="#3a3f4a" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M12.6 16.6C13 9 31 9 31.4 16.6Z" fill="#2e8b57" />
      <rect x="11.6" y="15.4" width="20.8" height="3.4" rx="1.6" fill="#24704a" />
      <circle cx="22" cy="9.6" r="2.6" fill="#f6cd6b" />
    </svg>
  )
}

function Gift({ size = 88 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <rect x="8" y="21" width="32" height="24" rx="3" fill="#d42a2a" />
      <rect x="21" y="21" width="6" height="24" fill="#f6cd6b" />
      <g className="gift-lid">
        <rect x="5" y="14" width="38" height="9" rx="2" fill="#e23434" />
        <rect x="21" y="14" width="6" height="9" fill="#f6cd6b" />
        <path
          d="M24 14C19 6 12 8 14 12 15.4 14 20 14 24 14ZM24 14C29 6 36 8 34 12 32.6 14 28 14 24 14Z"
          fill="#f6cd6b"
          stroke="#d9a63a"
          strokeWidth=".8"
        />
      </g>
    </svg>
  )
}

function Flake({ size = 22 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="#eaf4ff" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" />
      <path d="M9.6 3.6 12 6l2.4-2.4M9.6 20.4 12 18l2.4 2.4M3.6 10.2l3.3.8-.9 3.3M20.4 13.8l-3.3-.8.9-3.3M5.9 18.6l1.1-3.2 3.3.9M18.1 5.4 17 8.6l-3.3-.9" />
    </svg>
  )
}

const NIGHT = '#2a2140'
// A pale edge, so a dark bat or spider still reads on a dark night.
const EDGE = { stroke: '#b9acdf', strokeWidth: 0.7 }

function Ghost({ size = 80 }) {
  return (
    <svg viewBox="0 0 40 46" width={size} height={size * 1.15} aria-hidden="true">
      <path
        d="M5 22C5 10 12.5 3 20 3S35 10 35 22V40L31 37 27 41 23.5 37.4 20 41 16.5 37.4 13 41 9 37 5 40Z"
        fill="#f6f3ff"
        stroke="#d8d1f0"
        strokeWidth="1"
      />
      <path className="ghost-arm" d="M5.4 24C2.6 25 1.4 27.6 1.6 30 3.6 28.4 5 27.6 5.6 28Z" fill="#f6f3ff" />
      <path d="M34.6 24C37.4 25 38.6 27.6 38.4 30 36.4 28.4 35 27.6 34.4 28Z" fill="#f6f3ff" />
      <ellipse cx="15" cy="19" rx="2.2" ry="3.2" fill={NIGHT} />
      <ellipse cx="25" cy="19" rx="2.2" ry="3.2" fill={NIGHT} />
      <ellipse cx="20" cy="28" rx="2.6" ry="3.4" fill={NIGHT} />
      <circle cx="11.6" cy="24" r="1.6" fill="#f2a7c3" opacity=".7" />
      <circle cx="28.4" cy="24" r="1.6" fill="#f2a7c3" opacity=".7" />
    </svg>
  )
}

function Bat({ size = 44 }) {
  return (
    <svg viewBox="0 0 40 20" width={size} height={size / 2} aria-hidden="true">
      <g className="bat-wing bat-wing-l">
        <path d="M16 9C12 3 6 2.6 .6 5.6 3.6 6.6 4.6 8.6 3.6 11 6.6 10 8.6 11 9.6 13 11.6 11 13.6 11 16 12.4Z" fill={NIGHT} {...EDGE} />
      </g>
      <g className="bat-wing bat-wing-r">
        <path d="M24 9C28 3 34 2.6 39.4 5.6 36.4 6.6 35.4 8.6 36.4 11 33.4 10 31.4 11 30.4 13 28.4 11 26.4 11 24 12.4Z" fill={NIGHT} {...EDGE} />
      </g>
      <path d="M17 6 17.6 2.4 19.2 5ZM23 6 22.4 2.4 20.8 5Z" fill={NIGHT} />
      <ellipse cx="20" cy="10" rx="4.4" ry="5.4" fill={NIGHT} {...EDGE} />
      <circle cx="18.4" cy="8.4" r=".9" fill="#ffd45c" /><circle cx="21.6" cy="8.4" r=".9" fill="#ffd45c" />
      <path d="M18.8 11.6 19.4 12.8 20 11.8 20.6 12.8 21.2 11.6" stroke="#fff" strokeWidth=".5" fill="none" />
    </svg>
  )
}

function Pumpkin({ size = 80 }) {
  return (
    <svg viewBox="0 0 48 42" width={size} height={size * 0.875} aria-hidden="true">
      <path d="M22 8C22 5 23 2.4 25.6 1.4L27 3C25.4 3.8 24.8 5.6 25 8Z" fill="#4c6b2a" />
      <ellipse cx="14" cy="25" rx="11" ry="14" fill="#e2731c" />
      <ellipse cx="34" cy="25" rx="11" ry="14" fill="#e2731c" />
      <ellipse cx="24" cy="25" rx="11" ry="15" fill="#f28c28" />
      <g className="jack-face" fill="#ffd45c">
        <path d="M13 20 18.5 14.6 20 21.4ZM35 20 29.5 14.6 28 21.4Z" />
        <path d="M22.6 24 24 21.4 25.4 24Z" />
        <path d="M11 27C14 33 34 33 37 27L33.4 28.6 32 31 29.6 29.2 26.4 31.6 24 29.4 21.6 31.6 18.4 29.2 16 31 14.6 28.6Z" />
      </g>
    </svg>
  )
}

function Spider({ size = 64, thread = false }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" overflow="visible">
      {thread ? <path d="M20 -2000V22" stroke="#e8e4f4" strokeWidth=".5" /> : null}
      <g className="spider-legs" stroke="#4a3b70" strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M14 24 6 18 3 22M14 27 4 27 2 31M15 30 7 34 6 38M16 32 11 38 12 40" />
        <path d="M26 24 34 18 37 22M26 27 36 27 38 31M25 30 33 34 34 38M24 32 29 38 28 40" />
      </g>
      <circle cx="20" cy="28" r="8" fill={NIGHT} {...EDGE} />
      <circle cx="20" cy="20" r="5" fill={NIGHT} {...EDGE} />
      <circle cx="18" cy="19.4" r="1.6" fill="#fff" /><circle cx="22" cy="19.4" r="1.6" fill="#fff" />
      <circle cx="18.3" cy="19.8" r=".7" fill={NIGHT} /><circle cx="22.3" cy="19.8" r=".7" fill={NIGHT} />
      <path d="M18.4 22.4Q20 23.6 21.6 22.4" stroke="#fff" strokeWidth=".6" fill="none" strokeLinecap="round" />
    </svg>
  )
}

const MAPLE = 'M0 -7 1.5 -3.5 4.5 -4.5 3.5 -1.5 6.5 -.5 3.5 1 4.5 4 1.5 3 0 6.5-1.5 3-4.5 4-3.5 1-6.5-.5-3.5-1.5-4.5-4.5-1.5-3.5Z'
const OAK = 'M0 -7C2 -6 1 -4.5 3 -4 4.6 -3.4 2.4 -1.6 4 -1 5.6 -.2 3 1.6 3.6 3 4 4.6 1.4 4.4 0 7-1.4 4.4-4 4.6-3.6 3-3 1.6-5.6-.2-4-1-2.4-1.6-4.6-3.4-3-4-1-4.5-2-6 0-7Z'

function Leaf({ size = 22, oak = false, colour = '#e0452b' }) {
  return (
    <svg viewBox="-8 -8 16 16" width={size} height={size} aria-hidden="true">
      <path d={oak ? OAK : MAPLE} fill={colour} />
      <path d="M0 6.5V2" stroke="#7a3d1c" strokeWidth=".8" />
    </svg>
  )
}

function Acorn() {
  return (
    <>
      <path d="M-3.6 -1.2C-3.6 3 -1.6 6 0 6.6 1.6 6 3.6 3 3.6 -1.2Z" fill="#b8763a" />
      <path d="M-4.4 -1C-4.4 -4 4.4 -4 4.4 -1Z" fill="#6b4226" />
      <path d="M0 -3.4V-5.4" stroke="#6b4226" strokeWidth="1" />
    </>
  )
}

const FAN = ['#8b4a2b', '#c0612b', '#e8a33a']
function Turkey({ size }) {
  return (
    <svg className="turkey-shape" viewBox="-8 -2 56 46" aria-hidden="true" width={size} height={size ? (size * 46) / 56 : undefined}>
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i} transform={`translate(15 27) rotate(${(-165 + i * (150 / 8)).toFixed(1)})`}>
          <ellipse cx="11" cy="0" rx="10" ry="3.4" fill={FAN[i % 3]} />
          <ellipse cx="18" cy="0" rx="3" ry="2.6" fill="#f2d18a" opacity=".55" />
        </g>
      ))}
      <ellipse cx="21" cy="29" rx="11" ry="8.6" fill="#5b3420" />
      <path d="M14 27C17 24.5 23 24.5 26 28.5 22 31 17 31 14 27Z" fill="#7a4628" />
      <path d="M29 25C31 21 33 17 34 13.5L37.4 14C37 18 35 23 32 27.5Z" fill="#5b3420" />
      <circle cx="36" cy="12" r="3.4" fill="#c9d3dc" />
      <path d="M39 11.4 42.4 12.6 39 13.6Z" fill="#f0a63a" />
      <path d="M38.6 10.6C40.4 11 40.6 13.6 39.8 15.6 39.4 14 39 12.6 38.2 12Z" fill="#d8323a" />
      <path d="M36.6 15C37.6 16.6 37.2 19 35.6 19.6 35 18 35.2 16.2 35.6 15Z" fill="#d8323a" />
      <circle cx="36.8" cy="11.2" r=".7" fill="#1b1012" />
      <g stroke="#f0a63a" strokeWidth="1.3" strokeLinecap="round" fill="none">
        <path className="turkey-leg turkey-leg-a" d="M19 36 18 42.5M18 42.5 16 43.4M18 42.5 19.6 43.6" />
        <path className="turkey-leg turkey-leg-b" d="M24 36 25 42.5M25 42.5 23.4 43.6M25 42.5 27 43.4" />
      </g>
    </svg>
  )
}

// The greeting buttons' faces for Thanksgiving and Christmas: small, facing
// out, one wing or mitten raised and waving (see .wave-arm in styles.css).
function WavingTurkey({ size = 26 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      {/* The tail, fanned out behind. */}
      {[-70, -35, 0, 35, 70].map((a, i) => (
        <ellipse key={a} cx="16" cy="8" rx="4" ry="8.5" transform={`rotate(${a} 16 18)`} fill={['#c2452d', '#e07a2e', '#f2b45a', '#e07a2e', '#c2452d'][i]} />
      ))}
      <ellipse cx="16" cy="22" rx="7.5" ry="7" fill="#6b3d22" />
      <ellipse cx="16" cy="24" rx="4.4" ry="3.6" fill="#8a5230" />
      <g className="wave-arm" style={{ transformOrigin: '21px 21px' }}>
        <path d="M20.5 21.5C23 19 25.5 15.5 26.5 12.5 27.6 14.6 26.4 19 22.6 23Z" fill="#5a321c" />
      </g>
      <path d="M11.6 22.6C9.6 21.6 8 19.6 7.6 17.6 9.8 18.4 11.6 20 12.6 21.6Z" fill="#5a321c" />
      <circle cx="16" cy="13.5" r="4.4" fill="#c9d3dc" />
      <circle cx="14.4" cy="12.8" r=".9" fill="#1b1012" /><circle cx="17.6" cy="12.8" r=".9" fill="#1b1012" />
      <path d="M14.8 14.4 17.2 14.4 16 16.4Z" fill="#f0a63a" />
      <path d="M16.6 15.6C17.6 16.4 17.4 18.4 16.4 18.8 16 17.8 16.1 16.6 16.6 15.6Z" fill="#d8323a" />
      <g stroke="#f0a63a" strokeWidth="1.2" strokeLinecap="round"><path d="M13.6 28.6v2.2M18.4 28.6v2.2" /></g>
    </svg>
  )
}

function WavingSanta({ size = 26 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      {/* The red coat's shoulders, and the waving arm with its white cuff and mitten. */}
      <path d="M5 32C5 25 10 22 16 22S27 25 27 32Z" fill="#d42a2a" />
      <g className="wave-arm" style={{ transformOrigin: '24px 25px' }}>
        <path d="M23 25.5 27.6 17.6 30 19 25.8 27Z" fill="#d42a2a" />
        <rect x="26.4" y="15.4" width="4.4" height="2.6" rx="1.2" transform="rotate(30 28.6 16.7)" fill="#f4f1ea" />
        <circle cx="29.6" cy="13.4" r="2.6" fill="#2e7d4f" />
      </g>
      <circle cx="16" cy="15" r="6.4" fill="#f2c6a0" />
      {/* Beard and moustache. */}
      <path d="M9.4 15.6C9.4 23 13 26 16 26S22.6 23 22.6 15.6C21 18 19 18.6 16 18.6S11 18 9.4 15.6Z" fill="#f4f1ea" />
      <path d="M12.6 18.2C14 17 15.4 17.2 16 18 16.6 17.2 18 17 19.4 18.2 18 19.4 16.6 19 16 18.6 15.4 19 14 19.4 12.6 18.2Z" fill="#e8e3d8" />
      <circle cx="13.8" cy="14" r=".85" fill="#2a1a12" /><circle cx="18.2" cy="14" r=".85" fill="#2a1a12" />
      <circle cx="16" cy="16.2" r="1.1" fill="#e89a86" />
      {/* Hat, flopping to one side, with its white brim and bobble. */}
      <path d="M9.6 11C10 5 15 2.6 20 3.6 23 4.2 25 6.4 25.6 9.4L23 10.6C22.6 8.4 21.4 7 20 6.6 22 8.4 22.6 10 22.4 11Z" fill="#d42a2a" />
      <rect x="8.8" y="9.8" width="14.4" height="3.2" rx="1.6" fill="#f4f1ea" />
      <circle cx="25.6" cy="10.2" r="2" fill="#f4f1ea" />
    </svg>
  )
}

function Pie({ size = 96 }) {
  return (
    <svg viewBox="0 0 56 44" width={size} height={size * 0.79} aria-hidden="true">
      <g className="pie-steam" stroke="#f4efe6" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".8">
        <path d="M20 14C17 11 23 8 20 4" /><path d="M28 13C25 10 31 7 28 2" /><path d="M36 14C33 11 39 8 36 4" />
      </g>
      <ellipse cx="28" cy="33" rx="25" ry="8.6" fill="#b8763a" />
      <ellipse cx="28" cy="30" rx="24" ry="8" fill="#d9a35c" />
      <ellipse cx="28" cy="29.4" rx="20" ry="6.2" fill="#d9742a" />
      <ellipse cx="28" cy="30" rx="23" ry="7.4" fill="none" stroke="#f1c27d" strokeWidth="1.6" strokeDasharray="2 1.6" />
      <path d="M24 27C24 24 26 23 28 23S32 24 32 27C30 28 26 28 24 27Z" fill="#fffaf0" />
      <circle cx="28" cy="22.6" r="1.3" fill="#fffaf0" />
    </svg>
  )
}

function Squirrel({ size = 72 }) {
  return (
    <svg viewBox="0 0 48 40" width={size} height={size * 0.83} aria-hidden="true">
      <path className="squirrel-tail" d="M16 30C6 30 2 20 5 12 8 4 17 3 19 9 20.6 14 15 15 14 19 13 23 17 26 20 27Z" fill="#b5652b" />
      <path d="M8 13C10 8 15 7 17 10" stroke="#d9894a" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <ellipse cx="25" cy="27" rx="9" ry="8" fill="#a0522d" />
      <ellipse cx="27.6" cy="29" rx="4.4" ry="5" fill="#e8c39a" />
      <circle cx="33" cy="16" r="6" fill="#a0522d" />
      <path d="M31 11 31.6 6.6 34.2 10.2Z" fill="#a0522d" />
      <circle cx="35" cy="15" r="1.1" fill="#1b1012" />
      <circle cx="38.6" cy="17.4" r=".9" fill="#3a2418" />
      <g transform="translate(32 25) scale(.7)"><Acorn /></g>
      <path d="M22 34 20 37.6M29 34.4 31 37.6" stroke="#7a3d1c" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

// The character itself, standing still: in the picker, on a message, on a reaction.
export function GreetingFace({ kind, size = 40 }) {
  return <span className="gr-face">{face(kind, size)}</span>
}
function face(kind, size) {
  switch (kind) {
    case 'gingerbread': return <Gingerbread size={size * 0.84} />
    case 'penguin': return <Penguin size={size * 1.2} />
    case 'snowman': return <Snowman size={size * 0.74} />
    case 'gift': return <Gift size={size} />
    case 'ghost': return <Ghost size={size * 0.86} />
    case 'bats': return <Bat size={size * 1.1} />
    case 'pumpkin': return <Pumpkin size={size} />
    case 'spider': return <Spider size={size * 0.9} />
    case 'turkey': return <Turkey size={size * 1.1} />
    case 'leaves': return <Leaf size={size * 0.8} colour="#ff7a3d" />
    case 'pie': return <Pie size={size * 1.1} />
    case 'squirrel': return <Squirrel size={size} />
    default: return MORE_FACES[kind]?.(size) ?? <Flake size={size * 0.9} />
  }
}

// The season's own button: a snowflake, a jack-o'-lantern, a maple leaf, a
// burst of gold, a star.
export function SeasonFace({ season, size = 22 }) {
  if (season === 'halloween') return <Pumpkin size={size + 2} />
  if (season === 'thanksgiving') return <WavingTurkey size={size + 4} />
  // Christmas's greetings are the 'holiday' set.
  if (season === 'christmas' || season === 'holiday') return <WavingSanta size={size + 4} />
  if (season === 'newyear') return <SeasonBurst size={size} />
  if (season === 'july4') return <SeasonStar size={size} />
  return <Flake size={size - 2} />
}

// ---------- playing one ----------

// Pseudo-random but steady for a given play, so a re-render doesn't reshuffle the snow.
const scatter = (seed, i) => {
  const x = Math.sin(seed * 9301 + i * 49297) * 233280
  return x - Math.floor(x)
}

// Greetings already played on this device, so each plays by itself once (a
// tap plays it again). A convenience: lost with the browser's storage, a
// greeting plays again.
const PLAYED = 'seamline:greetingsPlayed'
const played = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(PLAYED) || '[]'))
  } catch {
    return new Set()
  }
}
export const unplayed = (keys) => {
  const done = played()
  return keys.filter((k) => !done.has(k))
}
export function markPlayed(keys) {
  try {
    localStorage.setItem(PLAYED, JSON.stringify([...new Set([...played(), ...keys])].slice(-400)))
  } catch {
    // Private window: it may play again.
  }
}

// Play a greeting across the screen, from anywhere (GreetingStage, in App).
export const playGreeting = (kind) => window.dispatchEvent(new CustomEvent('hugpix:greeting', { detail: { kind } }))

// Across the whole screen, over everything, touching nothing: a tap goes
// straight through. Its sound with it. Gone when it is done.
export function GreetingStage() {
  const [play, setPlay] = useState(null) // { kind, key }
  useEffect(() => {
    const on = (e) => isGreeting(e.detail?.kind) && setPlay({ kind: e.detail.kind, key: Date.now() })
    window.addEventListener('hugpix:greeting', on)
    return () => window.removeEventListener('hugpix:greeting', on)
  }, [])
  useEffect(() => {
    if (!play) return
    effectSound(play.kind)
    const t = setTimeout(() => setPlay((p) => (p?.key === play.key ? null : p)), stillPlease() ? 1800 : LONG[play.kind])
    return () => clearTimeout(t)
  }, [play])
  if (!play) return null
  const { kind, key } = play
  if (stillPlease()) {
    return (
      <div className="gr-stage" aria-hidden="true" key={key}>
        <div className="gr-calm"><GreetingFace kind={kind} size={96} /></div>
      </div>
    )
  }
  return (
    <div className={`gr-stage gr-${kind}`} aria-hidden="true" key={key}>
      {kind === 'gingerbread' && <div className="gr-actor"><div className="gr-bob"><Gingerbread size={78} /></div></div>}
      {kind === 'penguin' && <div className="gr-actor"><Penguin size={132} /></div>}
      {kind === 'snowman' && <div className="gr-actor"><Snowman size={124} /></div>}
      {kind === 'gift' && (
        <div className="gr-actor">
          <Gift size={112} />
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2
            const d = 90 + scatter(key, i) * 70
            return (
              <i
                key={i}
                className="gr-star"
                style={{ '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d - 30}px`, animationDelay: `${0.62 + scatter(key, i + 20) * 0.12}s` }}
              />
            )
          })}
        </div>
      )}
      {kind === 'flurry' && Array.from({ length: 26 }, (_, i) => (
        <span
          key={i}
          className="gr-flake"
          style={{
            left: `${scatter(key, i) * 100}%`,
            animationDelay: `${scatter(key, i + 40) * 1.1}s`,
            animationDuration: `${2.1 + scatter(key, i + 80) * 1.2}s`,
            '--drift': `${(scatter(key, i + 120) - 0.5) * 90}px`,
          }}
        >
          <Flake size={14 + Math.round(scatter(key, i + 160) * 18)} />
        </span>
      ))}
      {kind === 'ghost' && <div className="gr-actor"><Ghost size={120} /></div>}
      {kind === 'bats' && Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          className="gr-bat"
          style={{
            top: `${14 + scatter(key, i) * 46}%`,
            animationDelay: `${scatter(key, i + 30) * 0.7}s`,
            animationDuration: `${1.9 + scatter(key, i + 60) * 0.8}s`,
          }}
        >
          <Bat size={40 + Math.round(scatter(key, i + 90) * 30)} />
        </span>
      ))}
      {kind === 'pumpkin' && (
        <>
          <div className="gr-flash" />
          <div className="gr-actor"><Pumpkin size={128} /></div>
        </>
      )}
      {kind === 'spider' && <div className="gr-actor"><Spider size={84} thread /></div>}
      {kind === 'turkey' && <div className="gr-actor"><Turkey size={132} /></div>}
      {kind === 'leaves' && Array.from({ length: 24 }, (_, i) => (
        <span
          key={i}
          className="gr-leaf"
          style={{
            top: `${8 + scatter(key, i) * 80}%`,
            animationDelay: `${scatter(key, i + 40) * 0.8}s`,
            animationDuration: `${1.8 + scatter(key, i + 80) * 1.1}s`,
            '--dy': `${(scatter(key, i + 120) - 0.3) * 160}px`,
            '--spin': `${360 + Math.round(scatter(key, i + 140) * 540)}deg`,
          }}
        >
          <Leaf size={18 + Math.round(scatter(key, i + 160) * 16)} oak={i % 2 === 1} colour={['#e0452b', '#f4b942', '#ff7a3d', '#c9762c', '#a0522d'][i % 5]} />
        </span>
      ))}
      {kind === 'pie' && <div className="gr-actor"><Pie size={150} /></div>}
      {kind === 'squirrel' && <div className="gr-actor"><div className="gr-hop"><Squirrel size={92} /></div></div>}
      {MORE_FACES[kind] && <MoreStage kind={kind} seed={key} />}
    </div>
  )
}

// ---------- choosing one ----------

// The season's greetings, to send in a message or as a reaction to a photo.
// `counts` (by kind) shows how many have reacted with each; `mine` is mine.
export function GreetingPicker({ season, open, onClose, onPick, busy = false, note, counts = {}, mine = null, more = false }) {
  return (
    <Sheet open={open} onClose={onClose} title={`${SEASON_NAME[season] ?? 'Holiday'} greetings`} modal>
      {note && <p className="note">{note}</p>}
      <div className="gr-picker">
        {greetingsOf(season, more).map((g) => (
          <button
            key={g.kind}
            type="button"
            className={`gr-tile ${mine === g.kind ? 'on' : ''}`}
            disabled={busy}
            onPointerDown={unlockAudio}
            onClick={() => onPick(g.kind)}
          >
            <span className="gr-tile-face"><GreetingFace kind={g.kind} size={44} /></span>
            <span>{g.label}</span>
            {counts[g.kind] > 0 && <small>{counts[g.kind]}</small>}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
