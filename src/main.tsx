import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    const { Workbox } = await import('workbox-window');
    const wb = new Workbox('/sw.js');
    wb.addEventListener('waiting', () => {
      wb.messageSkipWaiting();
    });
    wb.addEventListener('externalwaiting', () => {
      wb.messageSkipWaiting();
    });
    await wb.register();
  });
}
