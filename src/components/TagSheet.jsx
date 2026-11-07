import { useState } from 'react'
import PeoplePicker from './PeoplePicker'
import Sheet from './Sheet'
import { getCloud } from '../lib/cloud'
import { taggedNames } from '../lib/collections'
import { isVideo } from '../lib/images'
import { usePeople } from '../lib/people'
import { announceTagged } from '../lib/push'
import { isPersonTag, setTags, useStore } from '../lib/store'

// Who is in one photo: people in Hugpix, and anyone else by name (the names
// tagged before are offered as they are typed). Mounted afresh each time it
// opens, so it starts from the photo's tags as they are. Anyone in Hugpix
// newly tagged (not yourself) gets a notification that they're in it.
export default function TagSheet({ open, album, photoId, onClose }) {
  const albums = useStore((s) => s.albums)
  const image = useStore((s) => s.images[photoId])
  const people = usePeople()
  const [value, setValue] = useState(() => album.tags?.[photoId] ?? [])
  const names = taggedNames(albums).filter((n) => !people.some((p) => p.name.toLowerCase() === n.toLowerCase()))
  const save = () => {
    const before = album.tags?.[photoId] ?? []
    const me = getCloud().session?.user.id
    const added = value.filter((t) => isPersonTag(t) && t !== me && !before.includes(t))
    setTags(album.id, photoId, value)
    announceTagged(album, photoId, added, !!image && isVideo(image))
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
