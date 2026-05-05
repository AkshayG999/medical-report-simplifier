import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the Firebase applet config that contains projectId and firestoreDatabaseId
const configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

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
    });
  } else {
    // If no service account is provided, we throw a clear error
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_PATH is not set in .env. " +
      "A service account key is required for the backend to bypass Firestore security rules."
    );
  }
} else {
  app = admin.app();
}

// Use the specific named Firestore database from the config
const databaseId: string = firebaseConfig.firestoreDatabaseId || '(default)';
export const db = getFirestore(app, databaseId);

export { firebaseConfig };
export default admin;
