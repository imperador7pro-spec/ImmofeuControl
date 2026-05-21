'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { requestFcmToken, onForegroundMessage } from '@/lib/firebase-client';
import { setFcmToken } from '@/actions/candidate';

export function FcmRegistrar({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    (async () => {
      const token = await requestFcmToken();
      if (token && active) {
        await setFcmToken(token);
      }
      await onForegroundMessage((payload) => {
        const p = payload as { notification?: { title?: string; body?: string } };
        if (p?.notification?.title) {
          toast(`${p.notification.title}\n${p.notification.body ?? ''}`, { duration: 8000 });
        }
      });
    })();
    return () => {
      active = false;
    };
  }, [enabled]);
  return null;
}
