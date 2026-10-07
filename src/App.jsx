import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import AuthScreen from './components/AuthScreen'
import ResetPassword from './components/ResetPassword'
import Shell from './Shell'

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="splash"><span className="wordmark">Klander<i>.</i></span></div>
  if (recovering) return <ResetPassword onDone={() => setRecovering(false)} />
  if (!session) return <AuthScreen />
  return <Shell key={session.user.id} user={session.user} />
}
