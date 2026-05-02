import React from 'react'
import ReactDOM from 'react-dom/client'
// 最早初始化调试控制台，确保能捕获所有日志
import { initDebugConsole } from './components/mobile/MobileDebugPanel'
initDebugConsole();

import App from './App'
import 'overlayscrollbars/styles/overlayscrollbars.css'
import './index.css'

/**
 * Register Service Worker for PWA offline support
 * Requirements: 10.1 - Cache essential assets for faster subsequent loads
 * Requirements: 10.3 - Display cached content when offline
 * Requirements: 10.4 - Sync when connectivity is restored
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        // Add a version query to force update when deployed (helps bypass aggressive CDN caching of sw.js).
        const registration = await navigator.serviceWorker.register('/sw.js?v=5', {
          scope: '/',
        });
        
        // Handle updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content is available, could prompt user to refresh
                console.log('[SW] New content available, refresh to update');
              }
            });
          }
        });
        
        console.log('[SW] Service Worker registered successfully');
      } catch (error) {
        console.error('[SW] Service Worker registration failed:', error);
      }
    });
  }
}

// Register service worker in production
if (import.meta.env.PROD) {
  registerServiceWorker();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
