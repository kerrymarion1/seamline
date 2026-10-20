import { Fragment, useEffect, useRef, useState } from 'react'
import { navigate } from '../App'
import AlbumPhotoPicker from '../components/AlbumPhotoPicker'
import Avatar from '../components/Avatar'
import { ago } from '../components/HomeLayouts'
import Icon from '../components/Icon'
import Linkify from '../components/Linkify'
import PeoplePicker from '../components/PeoplePicker'
import { ReactionChips, ReactionRow } from '../components/Reactions'
import Sheet from '../components/Sheet'
import {
  chatTitle, clearChat, deleteMessage, fetchMessageReactions, fetchMessages, fetchReads, isLive, isUnread, markRead, refreshChats, sendAlbumPhoto, sendMessage,
  isCleared, setMessageReaction, startChat, updateChat, useChats, watchChat,
} from '../lib/chat'
import { publicUrl, useCloud } from '../lib/cloud'
import { importFile } from '../lib/images'
import { personIn, usePeople } from '../lib/people'
import { pushStatus, turnOnPush } from '../lib/push'

// Messages: "/messages" lists the chats, newest first; "/messages/:id" is one
// chat. Anyone in the library can message anyone else in it, one to one or a
// few together, with text and photos (from the phone or from the albums).
// New messages, "typing…" and "Seen" arrive the moment they happen. The admin
// can read every chat, and the list says so.

const first = (name) => (name ?? '').split(' ')[0]

export default function Messages({ chatId }) {
  const people = usePeople()
  const cloud = useCloud()
  if (!cloud.features.messages) {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><Icon name="back" /></button>
          <div className="preview-title">Messages</div>
          <span className="topbar-spacer" />
        </header>
        <p className="hint centre">Messages aren't switched on yet.</p>
      </div>
    )
  }
  return chatId ? <Chat key={chatId} chatId={chatId} people={people} /> : <ChatList people={people} />
}

// Notifications are how a message is heard with Hugpix closed: until they are
// on for this device, the list says so and offers to turn them on.
const HEAR = {
  off: 'Turn on notifications so your phone sounds when someone messages you, even with Hugpix closed.',
  install: 'On iPhone and iPad, first add Hugpix to your Home Screen (Share, then Add to Home Screen) and open it from there.',
  blocked: 'Notifications are blocked for Hugpix. Allow them in your phone or browser settings to hear new messages.',
}
function HearMessages() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const check = () => pushStatus().then(setStatus).catch(() => setStatus('unsupported'))
  useEffect(() => {
    check()
  }, [])
  if (!HEAR[status]) return null
  const turnOn = async () => {
    setBusy(true)
    setError(null)
    try {
      await turnOnPush()
    } catch (e) {
      setError(e.message)
    }
    await check()
    setBusy(false)
  }
  return (
    <div className="hear-card">
      <span className="hear-icon" aria-hidden="true"><Icon name="bell" size={20} /></span>
      <div>
        <b>Hear new messages</b>
        <p>{HEAR[status]}</p>
        {error && <p className="nudge-error">{error}</p>}
        {status === 'off' && (
          <button className="pill-btn on" onClick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</button>
        )}
      </div>
    </div>
  )
}

function ChatList({ people }) {
  const chats = useChats().filter((c) => !isCleared(c))
  const { session, admin } = useCloud()
  const me = session?.user.id
  const [starting, setStarting] = useState(false)
  const [picked, setPicked] = useState([])
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const look = () => !document.hidden && refreshChats().catch((e) => setError(e.message))
    look()
    const t = setInterval(look, 15000)
    document.addEventListener('visibilitychange', look)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', look)
    }
  }, [])

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const chat = await startChat(picked, title)
      setStarting(false)
      setPicked([])
      setTitle('')
      navigate(`/messages/${chat.id}`)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }
  const nameOf = (id) => people.find((p) => p.id === id)?.name

  return (
    <div className="screen messages">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back"><Icon name="back" /></button>
        <div className="preview-title">Messages</div>
        {/* With no chats yet, the big button below is the only way in. */}
        {chats.length > 0 ? (
          <button className="pill-btn" onClick={() => setStarting(true)}><Icon name="plus" size={16} /> New</button>
        ) : (
          <span className="topbar-spacer" />
        )}
      </header>
      <main className="chat-list">
        <HearMessages />
        {chats.length === 0 && (
          <div className="empty">
            <h2>No messages yet</h2>
            <p>Send a message or a photo to anyone in Hugpix, or to a few people at once.</p>
            <button className="primary" onClick={() => setStarting(true)}><Icon name="plus" size={20} /> New message</button>
          </div>
        )}
        {chats.map((c) => {
          const group = c.members.length > 2
          const others = c.members.filter((id) => id !== me)
          const by = c.last_by === me ? 'You: ' : group && c.last_by ? `${first(nameOf(c.last_by))}: ` : ''
          const unread = isUnread(c)
          return (
            <button key={c.id} className={`chat-row ${unread ? 'unread' : ''}`} onClick={() => navigate(`/messages/${c.id}`)}>
              {group ? (
                <span className="chat-avatar group" aria-hidden="true"><Icon name="comment" size={18} /></span>
              ) : (
                <Avatar person={personIn(people, others[0])} size={46} className="chat-avatar" />
              )}
              <span className="chat-main">
                <b>{chatTitle(c, people)}</b>
                <small>{c.last_text ? `${by}${c.last_text}` : 'No messages yet'}</small>
                {!c.members.includes(me) && <small className="chat-aside">You're not in this chat</small>}
              </span>
              <span className="chat-side">
                <time>{ago(Date.parse(c.last_at))}</time>
                {unread && <i className="chat-dot" aria-label="Unread" />}
              </span>
            </button>
          )
        })}
        {chats.length > 0 && (
          <p className="note chat-privacy">
            {admin
              ? "As Hugpix's admin you can read every chat, including ones you're not in."
              : "Chats are seen by the people in them, and by Hugpix's admin."}
          </p>
        )}
        {error && <p className="preview-error" role="alert">{error}</p>}
      </main>

      <Sheet open={starting} onClose={() => setStarting(false)} title="New message" modal>
        <PeoplePicker people={people.filter((p) => p.id !== me)} value={picked} onChange={setPicked} placeholder="Who to? Type a name" />
        {picked.length > 1 && (
          <input
            className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group name (optional)" maxLength={60}
          />
        )}
        {error && <p className="preview-error" role="alert">{error}</p>}
        <button className="primary block" disabled={!picked.length || busy} onClick={start}>
          {busy ? 'Starting…' : picked.length > 1 ? 'Start group chat' : 'Start chat'}
        </button>
      </Sheet>
    </div>
  )
}

const dayOf = (t) => new Date(t).toDateString()
const dayLabel = (t) => {
  const d = new Date(t)
  const today = new Date()
  const yesterday = new Date(Date.now() - 864e5)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}
const timeOf = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Chat({ chatId, people }) {
  const chats = useChats()
  const chat = chats.find((c) => c.id === chatId)
  const { session, features } = useCloud()
  const me = session?.user.id
  const [messages, setMessages] = useState(null)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [about, setAbout] = useState(false)
  const [adding, setAdding] = useState([])
  const [rename, setRename] = useState('')
  const [reads, setReads] = useState({}) // person -> read up to, for "Seen"
  const [typingBy, setTypingBy] = useState(null)
  const [choosing, setChoosing] = useState(false) // phone or albums?
  const [fromAlbums, setFromAlbums] = useState(false)
  const [reactions, setReactions] = useState([]) // [{ message, user_id, emoji }]
  const [reactingTo, setReactingTo] = useState(null) // the message whose reactions are open
  const [confirming, setConfirming] = useState(null) // my message about to be deleted
  const [clearing, setClearing] = useState(false) // asking before the chat is deleted for me
  const list = useRef(null)
  const fileInput = useRef(null)
  const line = useRef(null)
  const reloadReactions = useRef(() => {})

  // The open reactions sit under their message; scrolled into sight when
  // that is the last one.
  useEffect(() => {
    if (reactingTo) list.current?.querySelector('.bubble.reacting .reaction-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [reactingTo])

  // The open reactions close at a tap anywhere else, or Escape. (A tap on
  // their own message is left to it: that closes them too.)
  useEffect(() => {
    if (!reactingTo) return
    const away = (e) => {
      if (!e.target.closest('.bubble.reacting')) setReactingTo(null)
    }
    const key = (e) => e.key === 'Escape' && setReactingTo(null)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [reactingTo])

  // The latest messages, then each new one the moment it is sent (with a
  // slower look every so often in case the live line drops), who has read
  // what, and who is typing.
  useEffect(() => {
    let alive = true
    let last = null
    const add = (fresh) =>
      setMessages((m) => {
        const have = m ?? []
        const extra = fresh.filter((x) => !have.some((y) => y.id === x.id))
        if (!extra.length) return m
        return [...have, ...extra].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      })
    const load = async () => {
      if (document.hidden) return
      try {
        const fresh = await fetchMessages(chatId, last)
        if (!alive) return
        if (!last) setMessages(fresh)
        else add(fresh)
        if (fresh.length) {
          last = fresh.at(-1).created_at
          markRead(chatId).catch(() => {})
        }
      } catch (e) {
        if (alive) setError(e.message)
      }
    }
    const seen = () => !document.hidden && markRead(chatId).catch(() => {})
    const loadReactions = () => fetchMessageReactions(chatId).then((r) => alive && setReactions(r)).catch(() => {})
    reloadReactions.current = loadReactions
    refreshChats().catch(() => {})
    fetchReads(chatId).then((r) => alive && setReads(r)).catch(() => {})
    load()
    loadReactions()
    line.current = watchChat(chatId, {
      onMessage: (m) => {
        add([m])
        setTypingBy(null)
        seen()
      },
      onRead: (person, at) => setReads((r) => ({ ...r, [person]: at })),
      onTyping: (person) => setTypingBy({ id: person, at: Date.now() }),
      onReaction: loadReactions,
      onDelete: (id) => setMessages((m) => (m?.some((x) => x.id === id) ? m.filter((x) => x.id !== id) : m)),
    })
    const t = setInterval(() => {
      load()
      if (!document.hidden) loadReactions()
    }, isLive() ? 20000 : 4000)
    document.addEventListener('visibilitychange', seen)
    return () => {
      alive = false
      clearInterval(t)
      document.removeEventListener('visibilitychange', seen)
      line.current?.close()
    }
  }, [chatId])

  // "Typing…" fades if nothing more comes for a few seconds.
  useEffect(() => {
    if (!typingBy) return
    const t = setTimeout(() => setTypingBy(null), 4500)
    return () => clearTimeout(t)
  }, [typingBy])

  // Keep the newest message in view.
  const count = messages?.length ?? 0
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count])

  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? 'Someone'
  const inChat = chat?.members.includes(me)
  const group = (chat?.members.length ?? 0) > 2
  const other = chat && !group ? personIn(people, chat.members.find((id) => id !== me)) : null
  const canReact = !!inChat && !!features.reactions

  // "Seen" under my latest message, when it is the last thing said: by whom,
  // in a group.
  const lastOne = messages?.at(-1)
  const seenBy = lastOne && lastOne.sender === me && chat
    ? chat.members.filter((id) => id !== me && reads[id] && Date.parse(reads[id]) >= Date.parse(lastOne.created_at))
    : []

  // Deleting one of mine: gone at once, back if the database says no.
  const removeMessage = async (m) => {
    setReactingTo(null)
    setConfirming(null)
    setMessages((ms) => ms.filter((x) => x.id !== m.id))
    try {
      await deleteMessage(m)
      refreshChats().catch(() => {})
    } catch (e) {
      setError(e.message)
      setMessages((ms) => [...ms, m].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)))
    }
  }

  // A reaction to a message: shown at once, then saved.
  const reactTo = (m, emoji) => {
    setReactingTo(null)
    setReactions((rs) => [
      ...rs.filter((r) => !(r.message === m.id && r.user_id === me)),
      ...(emoji ? [{ message: m.id, user_id: me, emoji }] : []),
    ])
    setMessageReaction(chat, m, emoji).catch((e) => {
      setError(e.message)
      reloadReactions.current()
    })
  }

  // Photos from the albums, sent one message each.
  const sendFromAlbums = async (ids, images) => {
    setFromAlbums(false)
    setSending(true)
    setError(null)
    try {
      for (const id of ids) {
        const sent = await sendAlbumPhoto(chat, images[id])
        if (sent) setMessages((m) => (m?.some((x) => x.id === sent.id) ? m : [...(m ?? []), sent]))
      }
    } catch (err) {
      setError(err.message || 'Could not send that photo.')
    }
    setSending(false)
  }

  const choosePhoto = async (file) => {
    setError(null)
    try {
      setPhoto(await importFile(file))
    } catch {
      setError('That file could not be read as a photo.')
    }
  }

  const send = async (e) => {
    e?.preventDefault()
    if (!chat || sending || (!text.trim() && !photo)) return
    setSending(true)
    setError(null)
    try {
      const sent = await sendMessage(chat, { text, image: photo })
      setText('')
      setPhoto(null)
      if (sent) setMessages((m) => (m?.some((x) => x.id === sent.id) ? m : [...(m ?? []), sent]))
    } catch (err) {
      setError(err.message || 'Could not send that.')
    }
    setSending(false)
  }

  // A group takes the new people in, history and all. A chat between two
  // stays between them: adding someone starts a new group chat instead.
  const addPeople = async () => {
    try {
      if (group) {
        await updateChat(chat, { members: [...new Set([...chat.members, ...adding])] })
      } else {
        const next = await startChat([...chat.members.filter((id) => id !== me), ...adding])
        setAbout(false)
        navigate(`/messages/${next.id}`)
      }
      setAdding([])
    } catch (e) {
      setError(e.message)
    }
  }
  const openAbout = () => {
    setRename(chat.title ?? '')
    setClearing(false)
    setAbout(true)
  }
  const deleteChat = async () => {
    try {
      await clearChat(chat)
      setAbout(false)
      navigate('/messages')
    } catch (e) {
      setError(e.message)
    }
  }
  const saveName = async () => {
    try {
      await updateChat(chat, { title: rename.trim() || null })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="screen messages chat">
      <header className="topbar">
        <button className="icon-btn" onClick={() => navigate('/messages')} aria-label="Back to messages"><Icon name="back" /></button>
        <button className="chat-head" onClick={openAbout} disabled={!chat}>
          {other && <Avatar person={other} size={34} />}
          <span className="chat-head-text">
            <b>{chat ? chatTitle(chat, people) : 'Messages'}</b>
            {chat && (
              <small className={typingBy ? 'typing' : ''}>
                {typingBy ? `${first(nameOf(typingBy.id))} is typing…` : group ? `${chat.members.length} people` : 'Tap for details'}
              </small>
            )}
          </span>
        </button>
      </header>

      <main className="chat-body" ref={list}>
        {messages === null && <p className="hint centre"><i className="spinner inline" /> Loading</p>}
        {messages?.length === 0 && <p className="hint centre">Say hello.</p>}
        {messages?.map((m, i) => {
          const mine = m.sender === me
          const newDay = i === 0 || dayOf(messages[i - 1].created_at) !== dayOf(m.created_at)
          const showName = group && !mine && (i === 0 || messages[i - 1].sender !== m.sender || newDay)
          // Someone else's picture sits beside the last of each run of their messages.
          const next = messages[i + 1]
          const lastOfRun = !next || next.sender !== m.sender || dayOf(next.created_at) !== dayOf(m.created_at)
          const bubble = (
              <div
                className={`bubble ${mine ? 'mine' : ''} ${reactingTo === m.id ? 'reacting' : ''}`}
                // A tap on a message (not its photo) offers the reactions, and
                // on my own messages a way to delete it.
                onClick={(e) => {
                  if ((!canReact && !mine) || e.target.closest('a, .bubble-photo, .reaction-chips, .bubble-tools')) return
                  setConfirming(null)
                  setReactingTo((r) => (r === m.id ? null : m.id))
                }}
              >
                {showName && <b className="bubble-who">{first(nameOf(m.sender))}</b>}
                {m.photo && (
                  <button className="bubble-photo" onClick={() => setViewing(m)} aria-label="Open photo">
                    <img
                      src={publicUrl(m.photo.thumb ?? m.photo.path)} alt="" loading="lazy" draggable={false}
                      style={{ aspectRatio: `${m.photo.width} / ${m.photo.height}` }}
                    />
                  </button>
                )}
                {m.body && <p><Linkify text={m.body} /></p>}
                <time>{timeOf(m.created_at)}</time>
                <ReactionChips
                  reactions={reactions.filter((r) => r.message === m.id)}
                  me={me}
                  onPick={(emoji) => canReact && reactTo(m, emoji)}
                />
                {reactingTo === m.id && (
                  <div className="bubble-tools">
                    {canReact && (
                      <ReactionRow reactions={reactions.filter((r) => r.message === m.id)} me={me} onPick={(emoji) => reactTo(m, emoji)} compact />
                    )}
                    {mine && (
                      <button
                        className={`bubble-delete ${confirming === m.id ? 'sure' : ''}`}
                        onClick={() => (confirming === m.id ? removeMessage(m) : setConfirming(m.id))}
                        aria-label={confirming === m.id ? 'Delete for everyone' : 'Delete this message'}
                      >
                        {confirming === m.id ? 'Delete for everyone' : <Icon name="trash" size={18} />}
                      </button>
                    )}
                  </div>
                )}
              </div>
          )
          return (
            <Fragment key={m.id}>
              {newDay && <p className="chat-day">{dayLabel(m.created_at)}</p>}
              {mine ? (
                bubble
              ) : (
                <div className="bubble-row">
                  {lastOfRun ? (
                    <Avatar person={personIn(people, m.sender) ?? { id: m.sender, name: nameOf(m.sender) }} size={28} className="bubble-face" />
                  ) : (
                    <span className="bubble-face" aria-hidden="true" />
                  )}
                  {bubble}
                </div>
              )}
            </Fragment>
          )
        })}
        {seenBy.length > 0 && (
          <p className="chat-seen">Seen{group ? ` by ${seenBy.map((id) => first(nameOf(id))).join(', ')}` : ''}</p>
        )}
        {typingBy && (
          <div className="bubble-row">
            <Avatar person={personIn(people, typingBy.id) ?? { id: typingBy.id, name: nameOf(typingBy.id) }} size={28} className="bubble-face" />
            <div className="bubble typing-bubble" aria-label={`${first(nameOf(typingBy.id))} is typing`}><i /><i /><i /></div>
          </div>
        )}
      </main>

      {error && <p className="preview-error chat-error" role="alert">{error}</p>}
      {chat && !inChat ? (
        <p className="note chat-readonly">You can read this chat as Hugpix's admin. Only the people in it can write here.</p>
      ) : (
        <form className="composer" onSubmit={send}>
          <button type="button" className="icon-btn" onClick={() => setChoosing(true)} aria-label="Add a photo" disabled={sending}>
            <Icon name="photo" size={22} />
          </button>
          <div className="composer-box">
            {photo && (
              <span className="composer-photo">
                <img src={photo.previewUrl} alt="" />
                <button type="button" onClick={() => setPhoto(null)} aria-label="Take the photo off"><Icon name="close" size={12} /></button>
              </span>
            )}
            <textarea
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                line.current?.typing()
              }}
              onKeyDown={(e) => {
                // Enter sends on a keyboard; Shift+Enter starts a new line.
                if (e.key === 'Enter' && !e.shiftKey && matchMedia('(hover: hover)').matches) send(e)
              }}
              placeholder="Message"
              maxLength={4000}
              aria-label="Message"
            />
          </div>
          <button className="send-btn" disabled={sending || (!text.trim() && !photo)} aria-label="Send">
            {sending ? <i className="spinner" /> : <Icon name="up" size={20} />}
          </button>
        </form>
      )}

      <Sheet open={choosing} onClose={() => setChoosing(false)} title="Send a photo" modal>
        <div className="new-choice">
          <button onClick={() => { setChoosing(false); fileInput.current.click() }}>
            <Icon name="photo" size={26} />
            <b>From your phone</b>
            <span>Your camera roll</span>
          </button>
          <button onClick={() => { setChoosing(false); setFromAlbums(true) }}>
            <Icon name="layers" size={26} />
            <b>From an album</b>
            <span>Photos already in Hugpix</span>
          </button>
        </div>
      </Sheet>
      <AlbumPhotoPicker
        open={fromAlbums}
        onClose={() => setFromAlbums(false)}
        onPick={sendFromAlbums}
        title="Send from an album"
        action={(n) => (n ? `Send ${n} photo${n === 1 ? '' : 's'}` : 'Choose up to 10')}
        secretNote="From a secret album: everyone in this chat will see the photos you send."
      />

      {viewing && (
        <div className="chat-viewer" onClick={() => setViewing(null)}>
          <button className="icon-btn" aria-label="Close photo"><Icon name="close" /></button>
          <img src={publicUrl(viewing.photo.path)} alt="" />
        </div>
      )}

      {chat && (
        <Sheet open={about} onClose={() => setAbout(false)} title={group ? 'Group chat' : 'Chat'} modal>
          {group && inChat && (
            <div className="password-row">
              <input className="field" value={rename} onChange={(e) => setRename(e.target.value)} placeholder="Group name" maxLength={60} />
              <button className="pill-btn" onClick={saveName} disabled={(rename.trim() || null) === (chat.title ?? null)}>Save</button>
            </div>
          )}
          <div className="label">People</div>
          <ul className="chat-people">
            {chat.members.map((id) => (
              <li key={id}><Avatar person={personIn(people, id) ?? { name: nameOf(id) }} size={30} />{nameOf(id)}{id === me && ' (you)'}</li>
            ))}
          </ul>
          {inChat && (
            <>
              <div className="label">Add people</div>
              <PeoplePicker
                people={people.filter((p) => !chat.members.includes(p.id))}
                value={adding}
                onChange={setAdding}
                placeholder="Type a name"
              />
              <button className="secondary block" disabled={!adding.length} onClick={addPeople}>
                {group ? `Add ${adding.length > 1 ? `${adding.length} people` : 'to chat'}` : 'Start a group chat'}
              </button>
              {group ? (
                <p className="note">New people can read the whole chat, from the start.</p>
              ) : (
                <p className="note">This chat stays between the two of you; a new group chat starts with everyone.</p>
              )}
            </>
          )}
          {features.clearing && (
            clearing ? (
              <div className="chat-clear">
                <p>Delete this chat? It goes from your list and its messages are cleared for you. {group ? 'Everyone else' : nameOf(chat.members.find((id) => id !== me) ?? '').split(' ')[0] || 'The others'} keep{group ? '' : 's'} it. If someone writes again, it comes back with just the new messages.</p>
                <div className="chat-clear-buttons">
                  <button className="secondary" onClick={() => setClearing(false)}>Keep it</button>
                  <button className="primary danger" onClick={deleteChat}>Delete chat</button>
                </div>
              </div>
            ) : (
              <button className="text-btn danger" onClick={() => setClearing(true)}>Delete chat</button>
            )
          )}
        </Sheet>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files[0]
          e.target.value = ''
          if (file) choosePhoto(file)
        }}
      />
    </div>
  )
}

