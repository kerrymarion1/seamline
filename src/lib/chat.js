import { useSyncExternalStore } from 'react'
import { getCloud, supabase, uploadMessagePhoto } from './cloud'
import { getState } from './store'
import { ensureLocal } from './sync'

// Messages between people in the library: chats of two or more, each a row in
// seamline_chats, its messages in seamline_messages (see 20261017_private.sql).
// The people in a chat see it, and so does the admin. Each person's "read up
// to" time is kept in seamline_chat_reads, which is where unread counts come
// from. New messages are fetched every few seconds while a chat is open, and
// a notification is sent for each one (seamline-notify).

let chats = []
let reads = {}
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const myId = () => getCloud().session?.user.id
const ready = () => !!supabase && !!getCloud().session && !!getCloud().features.messages

// Re-read the chat list and where I have read up to in each.
export async function refreshChats() {
  if (!ready()) return
  const [list, mine] = await Promise.all([
    supabase.from('seamline_chats').select('*').order('last_at', { ascending: false }),
    supabase.from('seamline_chat_reads').select('chat, read_at').eq('user_id', myId()),
  ])
  if (list.error) throw new Error(list.error.message)
  chats = list.data
  reads = Object.fromEntries((mine.data ?? []).map((r) => [r.chat, r.read_at]))
  emit()
}

// Something new from someone else that I haven't read, in a chat I'm in.
export const isUnread = (chat) =>
  chat.members.includes(myId()) && chat.last_by && chat.last_by !== myId() && chat.last_text != null
  && (!reads[chat.id] || Date.parse(chat.last_at) > Date.parse(reads[chat.id]))

export const useChats = () => useSyncExternalStore(subscribe, () => chats)
export const useUnread = () => useSyncExternalStore(subscribe, () => chats.filter(isUnread).length)

// A photo from an album, sent as a message: its full file is fetched first if
// this device only holds a small copy, then sent as a copy of its own, so the
// message keeps it even if the album's photo is later removed.
export async function sendAlbumPhoto(chat, image) {
  if (!image.blob && !(await ensureLocal([image.id]))) throw new Error('A photo could not be downloaded. Check your connection.')
  return sendMessage(chat, { image: getState().images[image.id] ?? image })
}

// The latest messages in a chat, oldest first; `after` fetches only newer ones.
export async function fetchMessages(chatId, after = null) {
  let query = supabase.from('seamline_messages').select('*').eq('chat', chatId)
  if (after) {
    query = query.gt('created_at', after).order('created_at', { ascending: true })
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(150)
  if (error) throw new Error(error.message)
  return data.reverse()
}

export async function markRead(chatId) {
  if (!ready()) return
  const at = new Date().toISOString()
  reads = { ...reads, [chatId]: at }
  emit()
  await supabase.from('seamline_chat_reads').upsert({ chat: chatId, user_id: myId(), read_at: at })
}

// A chat with exactly these people (me included), or a new one. Two people
// always share one chat; a group is new unless the same group already exists.
export async function startChat(people, title = '') {
  const members = [...new Set([myId(), ...people])]
  if (members.length < 2) throw new Error('Choose someone to message.')
  await refreshChats().catch(() => {})
  const same = (c) => c.members.length === members.length && members.every((id) => c.members.includes(id))
  const found = chats.find((c) => same(c) && (members.length === 2 || !title.trim() || c.title === title.trim()))
  if (found) return found
  const { data, error } = await supabase
    .from('seamline_chats')
    .insert({ library: getCloud().library, members, title: members.length > 2 && title.trim() ? title.trim().slice(0, 60) : null })
    .select()
    .single()
  if (error) throw new Error(error.message)
  chats = [data, ...chats]
  emit()
  return data
}

// Add people to a chat or rename it.
export async function updateChat(chat, patch) {
  const { data, error } = await supabase.from('seamline_chats').update(patch).eq('id', chat.id).select().single()
  if (error) throw new Error(error.message)
  chats = chats.map((c) => (c.id === data.id ? data : c))
  emit()
  return data
}

// Send text, a photo (an imported image record), or both. The photo goes
// online first; the others hear about it once it is sent.
export async function sendMessage(chat, { text = '', image = null }) {
  const body = text.trim()
  if (!body && !image) return null
  const photo = image ? await uploadMessagePhoto(image) : null
  const { data, error } = await supabase
    .from('seamline_messages')
    .insert({ chat: chat.id, body, photo })
    .select()
    .single()
  if (error) throw new Error(error.message)
  markRead(chat.id).catch(() => {})
  if (getCloud().features.push) {
    supabase.functions.invoke('seamline-notify', { body: { chat: chat.id, text: body, photo: !!photo } }).catch(() => {})
  }
  chats = chats.map((c) => (c.id === chat.id ? { ...c, last_at: data.created_at, last_text: body || 'Sent a photo', last_by: myId() } : c))
  emit()
  return data
}

// Reactions on a chat's messages: [{ message, user_id, emoji }].
export async function fetchMessageReactions(chatId) {
  if (!getCloud().features.reactions) return []
  const { data } = await supabase.from('seamline_message_reactions').select('message, user_id, emoji').eq('chat', chatId)
  return data ?? []
}

// React to a message, change the reaction, or (null) take it back. Whoever
// sent the message hears about a new one.
export async function setMessageReaction(chat, message, emoji) {
  const me = myId()
  if (!emoji) {
    const { error } = await supabase.from('seamline_message_reactions').delete().eq('message', message.id).eq('user_id', me)
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase
    .from('seamline_message_reactions')
    .upsert({ message: message.id, chat: chat.id, user_id: me, emoji }, { onConflict: 'message,user_id' })
  if (error) throw new Error(error.message)
  if (message.sender !== me && getCloud().features.push) {
    supabase.functions.invoke('seamline-notify', { body: { chat: chat.id, message: message.id, reaction: emoji } }).catch(() => {})
  }
}

// Where everyone in a chat has read up to, by person: for "Seen".
export async function fetchReads(chatId) {
  const { data } = await supabase.from('seamline_chat_reads').select('user_id, read_at').eq('chat', chatId)
  return Object.fromEntries((data ?? []).map((r) => [r.user_id, r.read_at]))
}

// ---------- live: things arrive the moment they happen ----------
// Only where the database supports it (features.live); the timed looks the
// screens already do carry on underneath, slower, in case the line drops.

export const isLive = () => !!supabase && !!getCloud().features.live

// One chat, while it is open: new messages, read receipts and "typing".
// Returns { typing() to say I'm typing, close() }.
export function watchChat(chatId, { onMessage, onRead, onTyping, onReaction = () => {} }) {
  if (!isLive()) return { typing() {}, close() {} }
  const channel = supabase
    .channel(`chat-${chatId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'seamline_messages', filter: `chat=eq.${chatId}` }, (e) =>
      onMessage(e.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seamline_message_reactions', filter: `chat=eq.${chatId}` }, () =>
      onReaction())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seamline_chat_reads', filter: `chat=eq.${chatId}` }, (e) =>
      e.new?.user_id && onRead(e.new.user_id, e.new.read_at))
    .on('broadcast', { event: 'typing' }, ({ payload }) => payload?.user && payload.user !== myId() && onTyping(payload.user))
    .subscribe()
  let last = 0
  return {
    // At most once every few seconds, however fast they type.
    typing() {
      if (Date.now() - last < 2500) return
      last = Date.now()
      channel.send({ type: 'broadcast', event: 'typing', payload: { user: myId() } }).catch(() => {})
    },
    close() {
      supabase.removeChannel(channel)
    },
  }
}

// The chat list: any chat I can see that changes (a new message moves it).
export function watchChats() {
  if (!isLive()) return () => {}
  const channel = supabase
    .channel('chats')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'seamline_chats' }, () => refreshChats().catch(() => {}))
    .subscribe()
  return () => supabase.removeChannel(channel)
}

export async function deleteMessage(message) {
  const { error } = await supabase.from('seamline_messages').delete().eq('id', message.id)
  if (error) throw new Error(error.message)
}

// What to call a chat: its name, or the other people's names.
export function chatTitle(chat, people) {
  if (chat.title) return chat.title
  const names = chat.members.filter((id) => id !== myId()).map((id) => people.find((p) => p.id === id)?.name ?? 'Someone')
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}
