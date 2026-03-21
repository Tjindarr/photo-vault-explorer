import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const setAppHeight = () => {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
};

setAppHeight();
window.addEventListener('resize', setAppHeight);
window.visualViewport?.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', setAppHeight);

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const { Workbox } = await import('workbox-window');
    const wb = new Workbox('/sw.js');
    wb.addEventListener('waiting', () => {
      wb.messageSkipWaiting();
    });
    await wb.register();
  });
}
