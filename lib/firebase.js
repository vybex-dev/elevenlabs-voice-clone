import admin from "firebase-admin";

let firestoreInstance = null;
let isInitialized = false;

export function getFirestore() {
  if (isInitialized) {
    return firestoreInstance;
  }

  isInitialized = true;

  try {
    if (admin.apps.length > 0) {
      firestoreInstance = admin.firestore();
      return firestoreInstance;
    }

    // 1. Try full JSON service account string
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      let credentials;
      try {
        credentials = JSON.parse(serviceAccountKey);
      } catch (e) {
        // May be base64 encoded
        credentials = JSON.parse(Buffer.from(serviceAccountKey, "base64").toString("utf-8"));
      }

      admin.initializeApp({
        credential: admin.credential.cert(credentials),
      });
      firestoreInstance = admin.firestore();
      console.log("Connected to Firebase Firestore via FIREBASE_SERVICE_ACCOUNT_KEY");
      return firestoreInstance;
    }

    // 2. Try individual environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && rawPrivateKey) {
      const privateKey = rawPrivateKey.replace(/\\n/g, "\n");
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      firestoreInstance = admin.firestore();
      console.log("Connected to Firebase Firestore for project:", projectId);
      return firestoreInstance;
    }

    // 3. Try standard Google Application Credentials if available
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
      firestoreInstance = admin.firestore();
      console.log("Connected to Firebase Firestore via GOOGLE_APPLICATION_CREDENTIALS");
      return firestoreInstance;
    }
  } catch (err) {
    console.warn("Firebase Admin initialization skipped / failed:", err.message);
    firestoreInstance = null;
  }

  return firestoreInstance;
}

export function isFirebaseConfigured() {
  return (
    !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    (!!process.env.FIREBASE_PROJECT_ID &&
      !!process.env.FIREBASE_CLIENT_EMAIL &&
      !!process.env.FIREBASE_PRIVATE_KEY) ||
    !!process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}
