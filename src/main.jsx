import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/app.css'
import { applyTheme } from './lib/theme'
import { captureInviteFromUrl } from './lib/friends'

applyTheme()
captureInviteFromUrl()
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
