import { useEffect } from 'react'
import { useKlanderData } from './lib/store'
import { supabase } from './lib/supabase'
import { applyThemeConfig } from './lib/themes'
import Onboarding from './components/Onboarding'
import CalendarApp from './CalendarApp'

export default function Shell({ user }) {
  const data = useKlanderData(user)
  const mode = data.profile?.theme
  const cfg = data.profile?.theme_config
  const cfgKey = JSON.stringify(cfg || {})
  useEffect(() => {
    if (!data.profile) return
    try { if (mode) localStorage.setItem('klander:theme', mode) } catch { /* ignore */ }
    applyThemeConfig(cfg || {}, mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cfgKey, !!data.profile])

  if (data.loading) return <div className="splash"><span className="wordmark">Klander<i>.</i></span></div>
  if (!data.profile) {
    return (
      <div className="auth"><div className="auth-card">
        <p className="error">{/single JSON object|PGRST116/.test(data.error || '')
          ? "Your sign-in didn't stick on this phone, so Klander couldn't load your account."
          : `Couldn't load your account${data.error ? `: ${data.error}` : '.'}`}</p>
        <p className="small muted" style={{ margin: 0 }}>Sign out and back in. If it keeps happening, open klander.vercel.app in Safari itself (not inside Instagram, WhatsApp or another app) and turn off Private Browsing.</p>
        <button className="btn" onClick={data.refresh}>Try again</button>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div></div>
    )
  }
  if (!data.profile.username) return <Onboarding data={data} user={user} />
  return <CalendarApp data={data} user={user} />
}
