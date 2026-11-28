// Runs at noon Eastern (17:00 UTC) on December 1 to 24 on Netlify, and asks
// Supabase's seamline-advent to send the day's Advent reminder. That function
// decides for itself whether it's time and sends each day only once, so a
// late or repeated run does no harm.
export default async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_KEY
  if (!url || !key) {
    console.error('advent: Supabase address or key is not set')
    return new Response('not configured', { status: 500 })
  }
  const res = await fetch(`${url}/functions/v1/seamline-advent`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const text = await res.text()
  console.log('advent:', res.status, text)
  return new Response(text, { status: res.ok ? 200 : 502 })
}

export const config = { schedule: '0 17 1-24 12 *' }
