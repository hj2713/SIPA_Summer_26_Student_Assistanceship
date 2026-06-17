import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Intercept all 401 response statuses to handle token expiration/invalidation
const { fetch: originalFetch } = window;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (response.status === 401) {
    const requestTarget = args[0];
    const url = typeof requestTarget === 'string'
      ? requestTarget
      : requestTarget instanceof URL
        ? requestTarget.href
        : (requestTarget && 'url' in requestTarget)
          ? (requestTarget as any).url
          : '';
    
    if (!url.includes('/api/auth/login')) {
      localStorage.removeItem("local_session");
      localStorage.removeItem("active_workspace_id");
      if (window.location.pathname !== '/login') {
        window.location.href = "/login";
      }
    }
  }
  return response;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

