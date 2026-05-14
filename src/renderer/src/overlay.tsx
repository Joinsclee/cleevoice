import React from 'react'
import ReactDOM from 'react-dom/client'
import { OverlayApp } from './OverlayApp'
import './index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('No se encontró el elemento #root para montar el overlay')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
)
