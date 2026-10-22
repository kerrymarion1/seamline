// Text with its web addresses made into links, each opening in a new tab
// (or the phone's browser, from the installed app). "www." addresses work
// too; a full stop or bracket just after one is left out of it.
const ADDRESS = /\b(?:https?:\/\/|www\.)[^\s<>"]+[^\s<>".,:;!?')\]]/gi

export default function Linkify({ text }) {
  const out = []
  let from = 0
  for (const match of text.matchAll(ADDRESS)) {
    const raw = match[0]
    if (match.index > from) out.push(text.slice(from, match.index))
    out.push(
      <a
        key={match.index}
        href={raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {raw}
      </a>,
    )
    from = match.index + raw.length
  }
  if (from < text.length) out.push(text.slice(from))
  return out
}
