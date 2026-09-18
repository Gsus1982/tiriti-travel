'use client';

import { useEffect, useState } from 'react';
import { IconBell } from './Icons';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

function isIosStandalone(): boolean {
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return isIos && !isStandalone;
}

export default function PushNotificationSetup() {
  const [status, setStatus] = useState<'idle' | 'subscribed' | 'unsupported' | 'unavailable' | 'ios-not-installed'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && isIosStandalone()) {
      setStatus('ios-not-installed');
      return;
    }
    navigator.serviceWorker.getRegistration().then((reg) => {
      reg?.pushManager.getSubscription().then((sub) => {
        if (sub) setStatus('subscribed');
      });
    });
  }, []);

  async function activate() {
    setError(null);
    try {
      const keyRes = await fetch('/api/push/vapid-public-key');
      if (keyRes.status === 503) {
        setStatus('unavailable');
        return;
      }
      const { publicKey } = await keyRes.json();

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('Permiso de notificaciones denegado.');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub)
      });
      setStatus('subscribed');
    } catch (e: any) {
      setError(e.message ?? 'No se pudo activar');
    }
  }

  if (status === 'unsupported') {
    return <p className="text-[11px] text-slate-400 dark:text-slate-500">Tu navegador no soporta notificaciones push.</p>;
  }
  if (status === 'ios-not-installed') {
    return (
      <p className="text-[11px] text-amber-700 dark:text-amber-300">
        En iPhone, las notificaciones push solo funcionan si has añadido esta app a tu pantalla de inicio (compartir →
        "Añadir a inicio"), no en una pestaña normal de Safari.
      </p>
    );
  }
  if (status === 'unavailable') {
    return (
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Notificaciones push no configuradas todavia (falta VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY en Vercel).
      </p>
    );
  }
  if (status === 'subscribed') {
    return (
      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
        <IconBell className="w-3.5 h-3.5" /> Notificaciones push activadas en este dispositivo.
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={activate}
        className="flex items-center gap-1.5 text-xs font-medium text-indigo hover:text-indigo-dark"
      >
        <IconBell className="w-3.5 h-3.5" />
        Activar notificaciones push en este dispositivo
      </button>
      {error && <p className="text-[10px] text-red-500 dark:text-red-400 mt-1">{error}</p>}
    </div>
  );
}
