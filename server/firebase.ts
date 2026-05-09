import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
const firebaseConfigDefaults = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  : {
      projectId: 'MY_PROJECT_ID',
      appId: 'MY_FIREBASE_WEB_APP_ID',
      apiKey: 'MY_FIREBASE_WEB_API_KEY',
      authDomain: 'MY_PROJECT.firebaseapp.com',
      firestoreDatabaseId: '(default)',
      storageBucket: 'MY_PROJECT.firebasestorage.app',
      messagingSenderId: 'MY_SENDER_ID',
      measurementId: '',
    };
const firebaseConfig = {
  ...firebaseConfigDefaults,
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigDefaults.projectId,
  appId: process.env.VITE_FIREBASE_APP_ID || firebaseConfigDefaults.appId,
  apiKey: process.env.VITE_FIREBASE_API_KEY || firebaseConfigDefaults.apiKey,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigDefaults.authDomain,
  firestoreDatabaseId: process.env.FIREBASE_FIRESTORE_DATABASE_ID || firebaseConfigDefaults.firestoreDatabaseId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigDefaults.storageBucket,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigDefaults.messagingSenderId,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigDefaults.measurementId,
};

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
const configuredStorageBucket = process.env.FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket;
const legacyStorageBucket = `${firebaseConfig.projectId}.appspot.com`;
export const storageBucketNames = Array.from(new Set([
  configuredStorageBucket,
  legacyStorageBucket,
].filter(Boolean)));

let app: admin.app.App;

if (!admin.apps.length) {
  if (serviceAccountPath) {
    // Use explicit service account JSON key file
    const resolvedPath = path.isAbsolute(serviceAccountPath)
      ? serviceAccountPath
      : path.resolve(process.cwd(), serviceAccountPath);

    const serviceAccount = JSON.parse(
      fs.readFileSync(resolvedPath, 'utf-8')
    );

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: firebaseConfig.projectId,
      storageBucket: configuredStorageBucket,
    });
  } else {
    if (process.env.NODE_ENV !== 'production' && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error(
        'Firebase Admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH in .env ' +
        'to your ignored service account JSON file, for example firebase-key.json.'
      );
    }

    // Use Application Default Credentials in managed Google Cloud runtimes.
    app = admin.initializeApp({
      projectId: firebaseConfig.projectId,
      storageBucket: configuredStorageBucket,
    });
  }
} else {
  app = admin.app();
}

// Use the specific named Firestore database from the config
const databaseId: string = firebaseConfig.firestoreDatabaseId || '(default)';
export const db = getFirestore(app, databaseId);
export function getStorageBucket(bucketName = configuredStorageBucket) {
  return admin.storage(app).bucket(bucketName);
}

export { firebaseConfig };
export default admin;
