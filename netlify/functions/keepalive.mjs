// Runs once a day on Netlify. Supabase pauses free projects after a week
// without activity, which would break shared links; one small database call
// a day keeps the project awake. It looks up a share code that does not exist,
// so it reads nothing and changes nothing.
export default async () => {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_KEY
  if (!url || !key) {
    console.error('keepalive: Supabase address or key is not set')
    return new Response('not configured', { status: 500 })
  }
  const res = await fetch(`${url}/rest/v1/rpc/seamline_get_share`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ share_token: 'keepalive' }),
  })
  console.log('keepalive: Supabase answered', res.status)
  return new Response(res.ok ? 'ok' : 'failed', { status: res.ok ? 200 : 502 })
}

export const config = { schedule: '0 9 * * *' }
