import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource/pixelify-sans/latin-500.css'
import '@fontsource/pixelify-sans/latin-600.css'
import '@fontsource/pixelify-sans/latin-700.css'
import '@fontsource/pixelify-sans/latin-ext-500.css'
import '@fontsource/pixelify-sans/latin-ext-600.css'
import './styles.css'
import './launcher.css'
import { AppProvider } from './lib/store'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>
)
