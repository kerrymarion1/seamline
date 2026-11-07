import { getCloud, supabase } from './cloud'

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

// Everything for one album: { hearts: [{ photo, user_id, emoji }], comments }.
// (`hearts` are all the reactions; before there were six they were all ❤️.)
// With threads (20261107_threads.sql), comments may answer one another
// (reply_to) and carry reactions of their own: `commentReactions`,
// [{ comment, user_id, emoji }].
export async function fetchAlbumSocial(albumId) {
  if (!on()) return { hearts: [], comments: [], commentReactions: [] }
  const columns = getCloud().features.reactions ? 'photo, user_id, emoji, created_at' : 'photo, user_id, created_at'
  const [hearts, comments, commentReactions] = await Promise.all([
    supabase.from('seamline_reactions').select(columns).eq('album', albumId),
    supabase.from('seamline_photo_comments').select('*').eq('album', albumId).order('created_at'),
    getCloud().features.threads
      ? supabase.from('seamline_comment_reactions').select('comment, user_id, emoji').eq('album', albumId)
      : Promise.resolve({ data: [] }),
  ])
  return {
    hearts: (hearts.data ?? []).map((h) => ({ emoji: '❤️', ...h })),
    comments: comments.data ?? [],
    commentReactions: commentReactions.data ?? [],
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
  const row = { library: library(), album: album.id, photo, user_id: me, ...(getCloud().features.reactions ? { emoji } : null) }
  const { error } = await supabase.from('seamline_reactions').upsert(row, { onConflict: 'library,album,photo,user_id' })
  if (error) throw new Error(error.message)
  tell({ album: album.id, name: album.name, photo, reaction: emoji, heart: emoji === '❤️' })
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
    .upsert({ comment: comment.id, library: library(), album: album.id, user_id: me, emoji }, { onConflict: 'comment,user_id' })
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
