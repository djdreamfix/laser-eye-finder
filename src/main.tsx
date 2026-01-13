import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

async function cleanupLegacyServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;

  const regs = await navigator.serviceWorker.getRegistrations();
  if (regs.length === 0) return;

  await Promise.all(regs.map(r => r.unregister()));

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }

  // One-time hard reload to drop any SW-controlled cached HTML/assets
  if (sessionStorage.getItem('sw-cleaned') !== '1') {
    sessionStorage.setItem('sw-cleaned', '1');
    window.location.reload();
  }
}

async function cleanupLegacyServiceWorkersOnce() {
  if (!('serviceWorker' in navigator)) return;

  // Persist across reloads and app restarts
  if (localStorage.getItem('sw-cleaned') === '1') return;

  const regs = await navigator.serviceWorker.getRegistrations();
  if (regs.length === 0) {
    localStorage.setItem('sw-cleaned', '1');
    return;
  }

  await Promise.all(regs.map(r => r.unregister()));

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }

  localStorage.setItem('sw-cleaned', '1');
  // Hard reload to drop any SW-controlled cached HTML/assets
  window.location.reload();
}

if ('serviceWorker' in navigator) {
  // If an old/broken SW is installed (common on iOS), clean it once.
  void cleanupLegacyServiceWorkersOnce();

  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // App should still run without SW
      });
    });
  }
}

createRoot(document.getElementById("root")!).render(<App />);


