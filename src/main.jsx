import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'
import { applySavedTheme } from './lib/themes'
import { captureInviteFromUrl } from './lib/friends'
import './lib/install' // listens for the one-tap install prompt as early as possible

applySavedTheme()
captureInviteFromUrl()
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
