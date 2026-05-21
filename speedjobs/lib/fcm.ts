import 'server-only';
import admin from 'firebase-admin';

function getFirebaseApp() {
  if (admin.apps.length > 0) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn('FIREBASE_SERVICE_ACCOUNT is not set — FCM disabled.');
    return null;
  }
  try {
    const serviceAccount = JSON.parse(raw);
    return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('Invalid FIREBASE_SERVICE_ACCOUNT JSON:', err);
    return null;
  }
}

export async function sendPushNotification(
  fcmToken: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const app = getFirebaseApp();
  if (!app) return;
  try {
    await admin.messaging(app).send({
      notification: { title, body },
      data,
      token: fcmToken,
    });
  } catch (error) {
    console.error('FCM error:', error);
  }
}

export async function sendMultiplePushNotifications(
  fcmTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  const app = getFirebaseApp();
  if (!app || fcmTokens.length === 0) return;
  try {
    await admin.messaging(app).sendEachForMulticast({
      tokens: fcmTokens,
      notification: { title, body },
      data,
    });
  } catch (error) {
    console.error('FCM multi error:', error);
  }
}
