import crypto from 'crypto';
import { db, getStorageBucket, storageBucketNames } from '../config/firebase.js';
import { logger } from '../utils/logger.js';

const REPORTS_COLLECTION = 'reports';
const REQUIRE_FIREBASE_STORAGE = process.env.REQUIRE_FIREBASE_STORAGE === 'true';

export interface ReportFileUpload {
  fileName: string;
  fileSize: number;
  mimeType: string;
  data: string;
}

export interface StoredReportFile {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storagePath: string;
  bucket: string;
}

export interface ReportFileDownload {
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface ReportRecord {
  id?: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  language: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  files?: StoredReportFile[];
  fileStorageStatus?: 'stored' | 'skipped' | 'failed';
  fileStorageError?: string;
  rawExtraction?: string;
  simplifiedReport?: string;
  recommendations?: string | null;
  insights?: string | null;
  resources?: string | null;
  errorMessage?: string;
  createdAt?: string;
  updatedAt?: string;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'report-file';
}

function decodeBase64File(data: string): Buffer {
  const base64 = data.includes(',') ? data.split(',').pop() || '' : data;
  return Buffer.from(base64, 'base64');
}

function isMissingBucketError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 404;
}

function isMissingStorageBucketSetup(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('Firebase Storage bucket not found.');
}

async function saveFileToAvailableBucket(
  storagePath: string,
  file: ReportFileUpload,
  reportId: string,
  userId: string
): Promise<string> {
  for (const bucketName of storageBucketNames) {
    const bucket = getStorageBucket(bucketName);
    const storageFile = bucket.file(storagePath);

    try {
      logger.info('storage.upload.started', {
        reportId,
        userId,
        bucket: bucket.name,
        storagePath,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
      });

      await storageFile.save(decodeBase64File(file.data), {
        resumable: false,
        metadata: {
          contentType: file.mimeType,
          metadata: {
            originalName: file.fileName,
            reportId,
            userId,
          },
        },
      });

      logger.info('storage.upload.completed', {
        reportId,
        userId,
        bucket: bucket.name,
        storagePath,
      });

      return bucket.name;
    } catch (error) {
      logger.warn('storage.upload.failed', {
        reportId,
        userId,
        bucket: bucket.name,
        storagePath,
        missingBucket: isMissingBucketError(error),
        error,
      });
      if (!isMissingBucketError(error)) {
        throw error;
      }
    }
  }

  const bucketList = storageBucketNames.join(', ');
  throw new Error(
    `Firebase Storage bucket not found. Tried: ${bucketList}. ` +
    'Enable Firebase Storage for this project or set FIREBASE_STORAGE_BUCKET to an existing bucket name.'
  );
}

async function uploadReportFiles(userId: string, reportId: string, files: ReportFileUpload[]): Promise<StoredReportFile[]> {
  const storedFiles: StoredReportFile[] = [];

  for (const [index, file] of files.entries()) {
    const safeFileName = sanitizeFileName(file.fileName);
    const storagePath = `users/${userId}/reports/${reportId}/${index + 1}-${safeFileName}`;
    const bucketName = await saveFileToAvailableBucket(storagePath, file, reportId, userId);

    storedFiles.push({
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      storagePath,
      bucket: bucketName,
    });
  }

  return storedFiles;
}

// Initialize the database (verifies Firestore connectivity)
export async function initializeDatabase(): Promise<void> {
  try {
    // A lightweight read to verify Firestore is reachable
    await db.collection(REPORTS_COLLECTION).limit(1).get();
    logger.info('database.initialized', {
      collection: REPORTS_COLLECTION,
    });
  } catch (error) {
    logger.error('database.initialization_failed', { error });
    throw error;
  }
}

// Save a new report (initial upload before processing)
export async function saveReport(report: {
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  language: string;
  files?: ReportFileUpload[];
  status?: string;
}): Promise<string> {
  const id = crypto.randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  let storedFiles: StoredReportFile[] = [];
  let fileStorageStatus: ReportRecord['fileStorageStatus'] = report.files?.length ? 'stored' : 'skipped';
  let fileStorageError: string | undefined;

  if (report.files?.length) {
    try {
      storedFiles = await uploadReportFiles(report.userId, id, report.files);
    } catch (error) {
      if (!isMissingStorageBucketSetup(error) || REQUIRE_FIREBASE_STORAGE) {
        throw error;
      }

      fileStorageStatus = 'skipped';
      fileStorageError = error instanceof Error ? error.message : 'Firebase Storage is not configured.';
      logger.warn('storage.upload.skipped', {
        reportId: id,
        userId: report.userId,
        error: fileStorageError,
      });
    }
  }

  const doc: Record<string, unknown> = {
    userId: report.userId,
    fileName: report.fileName,
    fileSize: report.fileSize,
    mimeType: report.mimeType,
    language: report.language,
    status: report.status || 'pending',
    files: storedFiles,
    fileStorageStatus,
    createdAt: now,
    updatedAt: now,
  };

  if (fileStorageError) {
    doc.fileStorageError = fileStorageError;
  }

  await db.collection(REPORTS_COLLECTION).doc(id).set(doc);
  logger.info('report.created', {
    reportId: id,
    userId: report.userId,
    status: doc.status,
    fileCount: storedFiles.length,
    fileStorageStatus,
  });
  return id;
}

// Update report with analysis results
export async function updateReportAnalysis(userId: string, id: string, updates: {
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

  if (!snapshot.exists || snapshot.get('userId') !== userId) {
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
  logger.info('report.analysis_updated', {
    reportId: id,
    userId,
    status: updates.status,
    fields: Object.keys(fields).filter((field) => field !== 'updatedAt'),
  });
  return true;
}

// Get all reports (ordered by creation date, newest first)
export async function getAllReports(userId: string): Promise<ReportRecord[]> {
  const snapshot = await db
    .collection(REPORTS_COLLECTION)
    .where('userId', '==', userId)
    .get();

  const reports = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  } as ReportRecord)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  logger.info('reports.listed', {
    userId,
    count: reports.length,
  });

  return reports;
}

// Get a report by ID
export async function getReportById(userId: string, id: string): Promise<ReportRecord | null> {
  const doc = await db.collection(REPORTS_COLLECTION).doc(id).get();

  if (!doc.exists || doc.get('userId') !== userId) {
    return null;
  }

  logger.info('report.fetched', {
    reportId: id,
    userId,
  });

  return { id: doc.id, ...doc.data() } as ReportRecord;
}

export async function getReportFile(userId: string, id: string, fileIndex: number): Promise<ReportFileDownload | null> {
  const report = await getReportById(userId, id);

  if (!report?.files || fileIndex < 0 || fileIndex >= report.files.length) {
    return null;
  }

  const file = report.files[fileIndex];
  logger.info('storage.download.started', {
    reportId: id,
    userId,
    fileIndex,
    bucket: file.bucket,
    storagePath: file.storagePath,
  });
  const [data] = await getStorageBucket(file.bucket).file(file.storagePath).download();

  logger.info('storage.download.completed', {
    reportId: id,
    userId,
    fileIndex,
    bytes: data.length,
  });

  return {
    fileName: file.fileName,
    mimeType: file.mimeType,
    data,
  };
}

// Delete a report by ID
export async function deleteReport(userId: string, id: string): Promise<boolean> {
  const docRef = db.collection(REPORTS_COLLECTION).doc(id);
  const snapshot = await docRef.get();

  if (!snapshot.exists || snapshot.get('userId') !== userId) {
    return false;
  }

  const report = snapshot.data() as ReportRecord;
  if (Array.isArray(report.files)) {
    await Promise.all(report.files.map(async (file) => {
      try {
        await getStorageBucket(file.bucket).file(file.storagePath).delete({ ignoreNotFound: true });
      } catch (error) {
        logger.warn('storage.delete.failed', {
          reportId: id,
          userId,
          storagePath: file.storagePath,
          error,
        });
      }
    }));
  }

  await docRef.delete();
  logger.info('report.deleted', {
    reportId: id,
    userId,
    fileCount: report.files?.length || 0,
  });
  return true;
}

// Close the database connection (no-op for Firestore — kept for API compat)
export function closeDatabase(): void {
  logger.info('database.close_skipped');
}
