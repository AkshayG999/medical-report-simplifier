import './env.js';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || 'MY_PROJECT_ID';
const firestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID || '(default)';
const configuredStorageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${firebaseProjectId}.firebasestorage.app`;
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
const legacyStorageBucket = `${firebaseProjectId}.appspot.com`;
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
      : path.resolve(__dirname, serviceAccountPath);

    const serviceAccount = JSON.parse(
      fs.readFileSync(resolvedPath, 'utf-8')
    );

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: firebaseProjectId,
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
      projectId: firebaseProjectId,
      storageBucket: configuredStorageBucket,
    });
  }
} else {
  app = admin.app();
}

// Use the specific named Firestore database from the config
export const db = getFirestore(app, firestoreDatabaseId);
export function getStorageBucket(bucketName = configuredStorageBucket) {
  return admin.storage(app).bucket(bucketName);
}

export default admin;
