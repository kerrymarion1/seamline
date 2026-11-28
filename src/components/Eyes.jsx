// Seen: a quiet line-drawn eye, like the app's other icons, in the theme's
// colour, that blinks now and then (see .eyes in styles.css).
export default function Eyes({ size = 18 }) {
  return (
    <svg className="eyes" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="eyes-lid">
        <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="2.8" />
      </g>
    </svg>
  )
}
