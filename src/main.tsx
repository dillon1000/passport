import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { BrandProvider } from './lib/brand-context.tsx'
import { PageTransitionProvider } from './lib/page-transition.tsx'
import { AppQueryProvider } from './lib/query-provider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppQueryProvider>
      <BrandProvider>
        <BrowserRouter>
          <PageTransitionProvider>
            <App />
          </PageTransitionProvider>
          <Toaster closeButton richColors position="top-right" />
        </BrowserRouter>
      </BrandProvider>
    </AppQueryProvider>
  </StrictMode>,
)
