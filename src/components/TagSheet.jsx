import { useState } from 'react'
import PeoplePicker from './PeoplePicker'
import Sheet from './Sheet'
import { taggedNames } from '../lib/collections'
import { usePeople } from '../lib/people'
import { setTags, useStore } from '../lib/store'

// Who is in one photo: people in Hugpix, and anyone else by name (the names
// tagged before are offered as they are typed). Mounted afresh each time it
// opens, so it starts from the photo's tags as they are.
export default function TagSheet({ open, album, photoId, onClose }) {
  const albums = useStore((s) => s.albums)
  const people = usePeople()
  const [value, setValue] = useState(() => album.tags?.[photoId] ?? [])
  const names = taggedNames(albums).filter((n) => !people.some((p) => p.name.toLowerCase() === n.toLowerCase()))
  const save = () => {
    setTags(album.id, photoId, value)
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Who's in this photo?" modal>
      <PeoplePicker
        people={[...people, ...names.map((n) => ({ id: n, name: n }))]}
        value={value}
        onChange={setValue}
        allowNew
        placeholder="Type a name"
      />
      <p className="note">Anyone can be tagged, in Hugpix or not. Tap a name under a photo to see every photo they're in.</p>
      <button className="primary block" onClick={save}>Save</button>
    </Sheet>
  )
}
