// The few lines about Hugpix that go with an invite when it is copied or sent
// (Kerry: "i want a blurb that sells the app. the primary benefit is having
// all of the family members' pictures in one spot instead of scrolling
// through messages", for app invites only, not album or photo links).

const WHY = [
  "Our whole family's photos live in one spot on Hugpix, so nobody has to scroll back through old messages to find one.",
  '',
  '• Everyone adds their photos and videos to the same albums',
  '• Your phone lets you know when new ones come in',
  "• Find any picture by who's in it or where it was taken",
  '• Comment, react and send holiday greetings',
  '• Private, just for family, with nothing to get from an app store',
].join('\n')

const message = (opener, url, closer) => `${opener}\n${url}\n\n${WHY}\n\n${closer}`

// A member's one-use invite link: no code needed.
export const inviteMessage = (url) =>
  message('Come join our family photos on Hugpix:', url, "This link is just for you. Tap it, make your account and you're in.")

// The admin's invite code, with the link that fills it in.
export const codeMessage = (url, code) =>
  message("You're invited to Hugpix, our family photo albums:", url, `Tap the link to make your account. Your invite code is ${code}.`)
