import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { BrandProvider } from './lib/brand-context.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrandProvider>
      <BrowserRouter>
        <App />
        <Toaster closeButton richColors position="top-right" />
      </BrowserRouter>
    </BrandProvider>
  </StrictMode>,
)
