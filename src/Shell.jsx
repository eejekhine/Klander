import { useEffect } from 'react'
import { useKlanderData } from './lib/store'
import { applyTheme } from './lib/theme'
import Onboarding from './components/Onboarding'
import CalendarApp from './CalendarApp'

export default function Shell({ user }) {
  const data = useKlanderData(user)
  const theme = data.profile?.theme
  useEffect(() => { if (theme) applyTheme(theme) }, [theme])

  if (data.loading) return <div className="splash"><span className="wordmark">Klander<i>.</i></span></div>
  if (!data.profile) {
    return (
      <div className="auth"><div className="auth-card">
        <p className="error">Couldn't load your account{data.error ? `: ${data.error}` : '.'}</p>
        <button className="btn" onClick={data.refresh}>Try again</button>
      </div></div>
    )
  }
  if (!data.profile.username) return <Onboarding data={data} user={user} />
  return <CalendarApp data={data} user={user} />
}
