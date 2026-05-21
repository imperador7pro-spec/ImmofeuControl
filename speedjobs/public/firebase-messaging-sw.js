/* Service worker for Firebase Cloud Messaging.
   This must be served from the site root. */
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

// Public Firebase config — injected by the build via env at deploy time.
// In production replace this object with your real values or generate this file from env.
firebase.initializeApp({
  apiKey: self.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: self.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: self.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: self.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: self.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: self.NEXT_PUBLIC_FIREBASE_APP_ID || '',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "SpeedJob's";
  const options = {
    body: payload.notification?.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const jobId = event.notification.data?.job_id;
  const url = jobId ? `/candidate/job/${jobId}` : '/candidate/home';
  event.waitUntil(clients.openWindow(url));
});
