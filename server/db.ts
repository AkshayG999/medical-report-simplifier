import crypto from 'crypto';
import { db } from './firebase.js';

const REPORTS_COLLECTION = 'reports';

export interface ReportRecord {
  id?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  language: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  fileData?: string; // Base64 encoded file for processing
  rawExtraction?: string;
  simplifiedReport?: string;
  recommendations?: string | null;
  insights?: string | null;
  resources?: string | null;
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Initialize the database (verifies Firestore connectivity)
export async function initializeDatabase(): Promise<void> {
  try {
    // A lightweight read to verify Firestore is reachable
    await db.collection(REPORTS_COLLECTION).limit(1).get();
    console.log('✅ Firebase Firestore initialized successfully');
  } catch (error) {
    console.error('❌ Failed to connect to Firebase Firestore:', error);
    throw error;
  }
}

// Save a new report (initial upload before processing)
export async function saveReport(report: {
  fileName: string;
  fileSize: number;
  mimeType: string;
  language: string;
  fileData?: string;
  status?: string;
}): Promise<string> {
  const id = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();

  const doc: Record<string, unknown> = {
    fileName: report.fileName,
    fileSize: report.fileSize,
    mimeType: report.mimeType,
    language: report.language,
    status: report.status || 'pending',
    createdAt: now,
    updatedAt: now,
  };

  // Only store fileData if provided (it can be very large)
  if (report.fileData) {
    doc.fileData = report.fileData;
  }

  await db.collection(REPORTS_COLLECTION).doc(id).set(doc);
  return id;
}

// Update report with analysis results
export async function updateReportAnalysis(id: string, updates: {
  status?: string;
  rawExtraction?: string;
  simplifiedReport?: string;
  recommendations?: string | null;
  insights?: string | null;
  resources?: string | null;
  errorMessage?: string;
}): Promise<boolean> {
  const docRef = db.collection(REPORTS_COLLECTION).doc(id);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return false;
  }

  const fields: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.status !== undefined) fields.status = updates.status;
  if (updates.rawExtraction !== undefined) fields.rawExtraction = updates.rawExtraction;
  if (updates.simplifiedReport !== undefined) fields.simplifiedReport = updates.simplifiedReport;
  if (updates.recommendations !== undefined) fields.recommendations = updates.recommendations;
  if (updates.insights !== undefined) fields.insights = updates.insights;
  if (updates.resources !== undefined) fields.resources = updates.resources;
  if (updates.errorMessage !== undefined) fields.errorMessage = updates.errorMessage;

  await docRef.update(fields);
  return true;
}

// Get all reports (ordered by creation date, newest first)
export async function getAllReports(): Promise<ReportRecord[]> {
  const snapshot = await db
    .collection(REPORTS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as ReportRecord[];
}

// Get a report by ID
export async function getReportById(id: string): Promise<ReportRecord | null> {
  const doc = await db.collection(REPORTS_COLLECTION).doc(id).get();

  if (!doc.exists) {
    return null;
  }

  return { id: doc.id, ...doc.data() } as ReportRecord;
}

// Delete a report by ID
export async function deleteReport(id: string): Promise<boolean> {
  const docRef = db.collection(REPORTS_COLLECTION).doc(id);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    return false;
  }

  await docRef.delete();
  return true;
}

// Close the database connection (no-op for Firestore — kept for API compat)
export function closeDatabase(): void {
  console.log('Firestore does not require explicit connection closure');
}
