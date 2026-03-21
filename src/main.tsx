import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

if (isStandalone) {
  document.body.classList.add('standalone-pwa');
}

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
