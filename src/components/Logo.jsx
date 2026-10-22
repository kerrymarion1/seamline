// The wordmark: "hug" and "pix" lean in and squish together, and three small
// hearts float up from where they meet. It plays once as a screen opens; with
// `loop` (the loading screen) it keeps hugging.
const HEART = 'M12 21C5 15 1 11.5 1 7a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 4.5-4 8-11 14z'

export default function Logo({ as: Tag = 'h1', loop = false }) {
  return (
    <Tag className={`logo ${loop ? 'loop' : ''}`} aria-label="Hugpix">
      <span className="logo-hug" aria-hidden="true">hug</span>
      <span className="logo-pix" aria-hidden="true">pix</span>
      {[0, 1, 2].map((i) => (
        <svg key={i} className={`logo-heart h${i}`} viewBox="0 0 24 22" aria-hidden="true">
          <path d={HEART} />
        </svg>
      ))}
    </Tag>
  )
}
