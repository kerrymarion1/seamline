// The wordmark: the letters slot in from below and above in turn, a fine seam
// is drawn beneath them, and the full stop drops into place.
export default function Logo({ as: Tag = 'h1' }) {
  return (
    <Tag className="logo" aria-label="Seamline">
      {[...'Seamline'].map((ch, i) => (
        <span key={i} style={{ '--i': i }} aria-hidden="true">{ch}</span>
      ))}
      <b aria-hidden="true" />
    </Tag>
  )
}
