// A person's profile photo, or the first letter of their name on the accent
// colour when they haven't set one. `person` is { name, avatar }.
export default function Avatar({ person, size = 30, className = '' }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) }
  if (person?.avatar) {
    return <img className={`avatar ${className}`} src={person.avatar} alt="" style={style} draggable={false} />
  }
  const letter = (person?.name ?? '').trim()[0]?.toUpperCase() ?? '?'
  return <span className={`avatar ${className}`} style={style} aria-hidden="true">{letter}</span>
}
