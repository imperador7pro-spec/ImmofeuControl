'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

function getApp() {
  if (!firebaseConfig.apiKey) return null;
  if (app) return app;
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  return app;
}

export async function getMessagingClient(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (!(await isSupported())) return null;
  const a = getApp();
  if (!a) return null;
  if (!messaging) messaging = getMessaging(a);
  return messaging;
}

export async function requestFcmToken(): Promise<string | null> {
  try {
    const m = await getMessagingClient();
    if (!m) return null;
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) return null;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(m, { vapidKey, serviceWorkerRegistration: reg });
    return token;
  } catch (err) {
    console.error('FCM token error:', err);
    return null;
  }
}

export async function onForegroundMessage(cb: (payload: unknown) => void) {
  const m = await getMessagingClient();
  if (!m) return;
  onMessage(m, cb);
}
