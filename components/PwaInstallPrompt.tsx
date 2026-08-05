'use client';

import { useEffect, useState } from 'react';

export default function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [visible, setVisible] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      const event = e as Event & { prompt: () => Promise<void> };
      setDeferred({ prompt: () => event.prompt() });
      if (!localStorage.getItem('pwa-install-dismissed')) {
        setVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  if (!online) {
    return (
      <div className="pwa-banner pwa-banner-offline" role="status">
        Offline mode — showing cached pages
      </div>
    );
  }

  if (!visible || !deferred) return null;

  return (
    <div className="pwa-banner pwa-banner-install">
      <span>Install this handbook for offline reading</span>
      <div className="pwa-banner-actions">
        <button
          type="button"
          className="pwa-btn pwa-btn-primary"
          onClick={async () => {
            await deferred.prompt();
            setVisible(false);
          }}
        >
          Install
        </button>
        <button
          type="button"
          className="pwa-btn"
          onClick={() => {
            localStorage.setItem('pwa-install-dismissed', '1');
            setVisible(false);
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
