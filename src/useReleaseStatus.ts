import { useEffect, useRef, useState } from 'react';

let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;

export function useReleaseStatus() {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const requestedUpdate = useRef(false);

  useEffect(() => {
    const online = () => setOffline(false);
    const offline = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const onWorkerState = () => {
      if (active && registration?.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
    };
    const onUpdateFound = () => {
      installing?.removeEventListener('statechange', onWorkerState);
      installing = registration?.installing ?? null;
      installing?.addEventListener('statechange', onWorkerState);
      onWorkerState();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void registration?.update().catch(() => {});
    };
    const onController = () => {
      if (requestedUpdate.current) location.reload();
      else setWaiting(null);
    };
    registrationPromise ??= navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    registrationPromise.then(result => {
      if (!active) return;
      registration = result;
      registration.addEventListener('updatefound', onUpdateFound);
      onUpdateFound();
      onVisible();
    }).catch(() => {
      registrationPromise = undefined;
      console.warn('Daylight could not enable offline mode.');
    });
    navigator.serviceWorker.addEventListener('controllerchange', onController);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      registration?.removeEventListener('updatefound', onUpdateFound);
      installing?.removeEventListener('statechange', onWorkerState);
      navigator.serviceWorker.removeEventListener('controllerchange', onController);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return {
    offline, updateReady: Boolean(waiting),
    applyUpdate: () => {
      if (!waiting) return;
      requestedUpdate.current = true;
      waiting.postMessage('APPLY_UPDATE');
    }
  };
}
