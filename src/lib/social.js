import { getCloud, supabase } from './cloud'
import { activeSeason } from './theme'

// Hearts and comments on the photos in an album, from the people in the
// library (seamline_reactions and seamline_photo_comments; see
// 20261018_social.sql). Visitors' favourites and notes on share links are
// kept apart, in cloud.js. Whoever added a photo hears about a heart or a
// comment on it, and so does anyone else who has commented on it.

const on = () => !!supabase && !!getCloud().features.social
const library = () => getCloud().library

// The six ways to react, to a photo or a message. Each person has one at a
// time on each, which they can change or take back.
export const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🎉']
// Four more, once the database takes them (the "moreReactions" switch).
export const EXTRA_REACTIONS = ['🤗', '🔥', '✨', '👏']

// The seven animated ones that replace them (components/ReactionFaces.jsx),
// once the database takes them (the "animatedReactions" switch; see
// 20261122_animated_reactions.sql). Saved by name, drawn in the theme showing.
export const KINDS = ['love', 'laugh', 'dance', 'smile', 'wave', 'like', 'rolleyes']
export const isKind = (emoji) => KINDS.includes(emoji)
export const KIND_NAMES = { love: 'Love', laugh: 'Laugh', dance: 'Dance', smile: 'Smile', wave: 'Wave', like: 'Like', rolleyes: 'Roll eyes' }
// For "Regine loved your photo", and under a name in the list of who reacted.
export const KIND_VERBS = {
  love: 'loved', laugh: 'laughed at', dance: 'danced to', smile: 'smiled at', wave: 'waved at', like: 'liked', rolleyes: 'rolled their eyes at',
}
export const KIND_DONE = { love: 'Loved', laugh: 'Laughed', dance: 'Danced', smile: 'Smiled', wave: 'Waved', like: 'Liked', rolleyes: 'Rolled their eyes' }
// The old emoji, as the kind each became. A phone still on an older Hugpix
// may give one; it shows as its kind.
const LEGACY = { '❤️': 'love', '😂': 'laugh', '👍': 'like', '🎉': 'dance', '🤗': 'smile', '😮': 'smile' }
const animated = () => !!getCloud().features.animatedReactions
// Reactions as read from the database, old emoji turned into their kinds once
// the seven are in use (before that they stay as they are, to match the picker).
export const asKinds = (rows) => (animated() ? rows.map((r) => (LEGACY[r.emoji] ? { ...r, emoji: LEGACY[r.emoji] } : r)) : rows)
// What to offer: the seven, or until the switch, the six (and with `more` the four more).
export const reactionChoices = (more) => (animated() ? KINDS : more ? [...REACTIONS, ...EXTRA_REACTIONS] : REACTIONS)
// The reaction a double tap gives.
export const loveKind = () => (animated() ? 'love' : '❤️')

// Reactions stay as sent: each remembers the theme it was given in (its
// `look`), once the database keeps it (the "reactionLooks" switch; see
// 20261122_reaction_looks.sql). Ones from before have none: the everyday look.
const looks = () => !!getCloud().features.reactionLooks
export const lookNow = () => activeSeason()?.id ?? 'everyday'
// The extra column to read, and the field to save, while looks are kept.
export const lookColumn = () => (looks() ? ', look' : '')
export const withLook = () => (looks() ? { look: lookNow() } : null)

// Everything for one album: { hearts: [{ photo, user_id, emoji }], comments }.
// (`hearts` are all the reactions; before there were six they were all ❤️.)
// With threads (20261107_threads.sql), comments may answer one another
// (reply_to) and carry reactions of their own: `commentReactions`,
// [{ comment, user_id, emoji }].
export async function fetchAlbumSocial(albumId) {
  if (!on()) return { hearts: [], comments: [], commentReactions: [] }
  const columns = (getCloud().features.reactions ? 'photo, user_id, emoji, created_at' : 'photo, user_id, created_at') + lookColumn()
  const [hearts, comments, commentReactions] = await Promise.all([
    supabase.from('seamline_reactions').select(columns).eq('album', albumId),
    supabase.from('seamline_photo_comments').select('*').eq('album', albumId).order('created_at'),
    getCloud().features.threads
      ? supabase.from('seamline_comment_reactions').select(`comment, user_id, emoji${lookColumn()}`).eq('album', albumId)
      : Promise.resolve({ data: [] }),
  ])
  return {
    hearts: asKinds((hearts.data ?? []).map((h) => ({ emoji: '❤️', ...h }))),
    comments: comments.data ?? [],
    commentReactions: asKinds(commentReactions.data ?? []),
  }
}

const tell = (body) => {
  if (getCloud().features.push) supabase.functions.invoke('seamline-notify', { body }).catch(() => {})
}

// React to a photo with `emoji`, change to another, or (null) take it back.
export async function setReaction(album, photo, emoji) {
  const me = getCloud().session.user.id
  if (!emoji) {
    const { error } = await supabase.from('seamline_reactions').delete().eq('album', album.id).eq('photo', photo).eq('user_id', me)
    if (error) throw new Error(error.message)
    return
  }
  const row = { library: library(), album: album.id, photo, user_id: me, ...(getCloud().features.reactions ? { emoji } : null), ...withLook() }
  const { error } = await supabase.from('seamline_reactions').upsert(row, { onConflict: 'library,album,photo,user_id' })
  if (error) throw new Error(error.message)
  tell({ album: album.id, name: album.name, photo, reaction: emoji, heart: emoji === '❤️' || emoji === 'love' })
}

// `replyTo` is the comment this answers (a reply to a reply answers the first
// one), and `mentioned` the account ids named with @ in it: they hear about it
// even when they haven't commented on the photo.
export async function addPhotoComment(album, photo, text, { replyTo = null, mentioned = [] } = {}) {
  const body = text.trim()
  if (!body) return null
  const threads = !!getCloud().features.threads
  const { data, error } = await supabase.from('seamline_photo_comments')
    .insert({ library: library(), album: album.id, photo, body: body.slice(0, 1000), ...(threads && replyTo ? { reply_to: replyTo } : null) })
    .select().single()
  if (error) throw new Error(error.message)
  tell({
    album: album.id, name: album.name, photo, comment: body.slice(0, 140),
    ...(threads && replyTo ? { replyTo } : null), ...(threads && mentioned.length ? { mentioned } : null),
  })
  return data
}

// React to a comment, change the reaction, or (null) take it back. Whoever
// wrote the comment hears about a new one.
export async function setCommentReaction(album, comment, emoji) {
  const me = getCloud().session.user.id
  if (!emoji) {
    const { error } = await supabase.from('seamline_comment_reactions').delete().eq('comment', comment.id).eq('user_id', me)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase.from('seamline_comment_reactions')
    .upsert({ comment: comment.id, library: library(), album: album.id, user_id: me, emoji, ...withLook() }, { onConflict: 'comment,user_id' })
  if (error) throw new Error(error.message)
  if (comment.user_id !== me) tell({ album: album.id, name: album.name, photo: comment.photo, commentId: comment.id, commentReaction: emoji })
}

// Ask people for their photos of what an album is about: they hear about it,
// and the album says so to them until they add something (album.asked).
export const askForPhotos = (album, people) => {
  if (people.length) tell({ album: album.id, name: album.name, ask: people })
}

export async function removePhotoComment(id) {
  const { error } = await supabase.from('seamline_photo_comments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// While an album is open, any heart or comment on it arrives at once.
export function watchAlbumSocial(albumId, onChange) {
  if (!on() || !getCloud().features.live) return () => {}
  const filter = `album=eq.${albumId}`
  const channel = supabase
    .channel(`album-${albumId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seamline_reactions', filter }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seamline_photo_comments', filter }, onChange)
  if (getCloud().features.threads) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'seamline_comment_reactions', filter }, onChange)
  channel.subscribe()
  return () => supabase.removeChannel(channel)
}
