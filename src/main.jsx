import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'
import { applySavedTheme } from './lib/themes'
import { captureInviteFromUrl } from './lib/friends'

applySavedTheme()
captureInviteFromUrl()
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
