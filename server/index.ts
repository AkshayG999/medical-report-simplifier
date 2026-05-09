import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import { initializeDatabase, saveReport, updateReportAnalysis, getAllReports, getReportById, getReportFile, deleteReport } from './db.js';
import { requireAuth, type AuthenticatedRequest } from './auth.js';
import { buildReportSummaryPdfHtml, ingestReportSummaryContent } from '../src/lib/pdfExport.ts';
import { reportProcessor } from './reportGraph.ts';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const VALID_STATUSES = new Set(['pending', 'processing', 'completed', 'failed']);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN || process.env.APP_URL || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const now = Date.now();
  const key = req.ip || req.header('x-forwarded-for') || 'unknown';
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (current.count >= RATE_LIMIT_MAX) {
    return res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' });
  }

  current.count += 1;
  return next();
}

// Middleware
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '50mb' }));

// API Routes
app.use('/api/reports', rateLimit);
app.use('/api/reports', requireAuth);

// Save initial report (before AI processing)
app.post('/api/reports', async (req, res) => {
  try {
    const { fileName, fileSize, mimeType, language, files } = req.body;
    const { uid } = (req as unknown as AuthenticatedRequest).user;

    if (typeof fileName !== 'string' || fileName.trim() === '') {
      return res.status(400).json({ success: false, error: 'fileName is required' });
    }

    if (typeof fileSize !== 'number' || fileSize < 0) {
      return res.status(400).json({ success: false, error: 'fileSize must be a non-negative number' });
    }

    if (typeof mimeType !== 'string' || mimeType.trim() === '') {
      return res.status(400).json({ success: false, error: 'mimeType is required' });
    }

    if (files !== undefined) {
      if (!Array.isArray(files)) {
        return res.status(400).json({ success: false, error: 'files must be an array' });
      }

      for (const file of files) {
        if (
          typeof file?.fileName !== 'string' ||
          typeof file?.fileSize !== 'number' ||
          typeof file?.mimeType !== 'string' ||
          typeof file?.data !== 'string'
        ) {
          return res.status(400).json({ success: false, error: 'Each file requires fileName, fileSize, mimeType, and data' });
        }
      }
    }

    const reportId = await saveReport({
      userId: uid,
      fileName: fileName.trim(),
      fileSize,
      mimeType: mimeType.trim(),
      language: language || 'English',
      files,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      reportId,
      message: 'Report saved successfully',
      status: 'pending'
    });
  } catch (error) {
    console.error('Error saving report:', error);
    res.status(500).json({ success: false, error: 'Failed to save report' });
  }
});

// Update report with AI analysis results
app.put('/api/reports/:id/analysis', async (req, res) => {
  try {
    const { status, rawExtraction, simplifiedReport, recommendations, insights, resources, errorMessage } = req.body;
    const { uid } = (req as unknown as AuthenticatedRequest).user;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: 'Invalid report status' });
    }

    const success = await updateReportAnalysis(uid, req.params.id, {
      status,
      rawExtraction,
      simplifiedReport,
      recommendations: recommendations ? JSON.stringify(recommendations) : null,
      insights,
      resources: resources ? JSON.stringify(resources) : null,
      errorMessage
    });

    if (!success) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    res.json({
      success: true,
      message: 'Report analysis updated successfully',
      status
    });
  } catch (error) {
    console.error('Error updating report analysis:', error);
    res.status(500).json({ success: false, error: 'Failed to update report analysis' });
  }
});

// Run AI analysis server-side so Gemini credentials never reach the browser.
app.post('/api/reports/:id/analyze', async (req, res) => {
  try {
    const { uid } = (req as unknown as AuthenticatedRequest).user;
    const { language, files } = req.body;

    if (typeof language !== 'string' || language.trim() === '') {
      return res.status(400).json({ success: false, error: 'language is required' });
    }

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one file is required for analysis' });
    }

    for (const file of files) {
      if (
        typeof file?.fileName !== 'string' ||
        typeof file?.mimeType !== 'string' ||
        typeof file?.data !== 'string'
      ) {
        return res.status(400).json({ success: false, error: 'Each file requires fileName, mimeType, and data' });
      }
    }

    const report = await getReportById(uid, req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    await updateReportAnalysis(uid, req.params.id, { status: 'processing' });

    const result = await reportProcessor.invoke({
      fileData: files[0]?.data,
      mimeType: files[0]?.mimeType,
      files,
      language,
    });

    const analysis = {
      rawExtraction: result.rawExtraction || '',
      simplifiedReport: result.simplifiedReport || '',
      recommendations: result.recommendations || [],
      insights: result.insights || '',
      resources: result.resources || [],
    };

    await updateReportAnalysis(uid, req.params.id, {
      status: 'completed',
      rawExtraction: analysis.rawExtraction,
      simplifiedReport: analysis.simplifiedReport,
      recommendations: JSON.stringify(analysis.recommendations),
      insights: analysis.insights,
      resources: JSON.stringify(analysis.resources),
    });

    res.json({ success: true, result: analysis });
  } catch (error) {
    console.error('Error analyzing report:', error);

    try {
      const { uid } = (req as unknown as AuthenticatedRequest).user;
      await updateReportAnalysis(uid, req.params.id, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown analysis error',
      });
    } catch (updateError) {
      console.error('Failed to update report analysis failure:', updateError);
    }

    res.status(500).json({ success: false, error: 'Failed to analyze report' });
  }
});

// Export report summary and insights as a directly downloadable PDF.
app.post('/api/reports/export-summary-pdf', async (req, res) => {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    const { language, summary, insights, recommendations } = req.body;

    if (typeof language !== 'string' || language.trim() === '') {
      return res.status(400).json({ success: false, error: 'language is required' });
    }

    if (typeof summary !== 'string' || summary.trim() === '') {
      return res.status(400).json({ success: false, error: 'summary is required' });
    }

    if (insights !== undefined && typeof insights !== 'string') {
      return res.status(400).json({ success: false, error: 'insights must be a string' });
    }

    if (recommendations !== undefined && !Array.isArray(recommendations)) {
      return res.status(400).json({ success: false, error: 'recommendations must be an array' });
    }

    const content = ingestReportSummaryContent({
      language,
      summary,
      insights,
      recommendations: Array.isArray(recommendations)
        ? recommendations.filter((recommendation) => typeof recommendation === 'string')
        : [],
    });
    const html = buildReportSummaryPdfHtml(content);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '18mm',
        right: '18mm',
        bottom: '18mm',
        left: '18mm',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="medinsight-report-summary.pdf"');
    res.send(pdf);
  } catch (error) {
    console.error('Error exporting report summary PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export report summary PDF. Please make sure Playwright Chromium is installed.',
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Get all reports
app.get('/api/reports', async (req, res) => {
  try {
    const { uid } = (req as unknown as AuthenticatedRequest).user;
    const reports = await getAllReports(uid);
    res.json({ success: true, reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reports' });
  }
});

// Get a specific report by ID
app.get('/api/reports/:id', async (req, res) => {
  try {
    const { uid } = (req as unknown as AuthenticatedRequest).user;
    const report = await getReportById(uid, req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    res.json({ success: true, report });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
});

// Get one uploaded report file for preview/download
app.get('/api/reports/:id/files/:fileIndex', async (req, res) => {
  try {
    const { uid } = (req as unknown as AuthenticatedRequest).user;
    const fileIndex = Number(req.params.fileIndex);

    if (!Number.isInteger(fileIndex) || fileIndex < 0) {
      return res.status(400).json({ success: false, error: 'Invalid file index' });
    }

    const file = await getReportFile(uid, req.params.id, fileIndex);

    if (!file) {
      return res.status(404).json({ success: false, error: 'Uploaded file not found' });
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
    res.send(file.data);
  } catch (error) {
    console.error('Error fetching uploaded report file:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch uploaded file' });
  }
});

// Delete a report by ID
app.delete('/api/reports/:id', async (req, res) => {
  try {
    const { uid } = (req as unknown as AuthenticatedRequest).user;
    const success = await deleteReport(uid, req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    res.json({ success: true, message: 'Report deleted successfully' });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ success: false, error: 'Failed to delete report' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Initialize Firebase and start server
async function start() {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🔥 Using Firebase Firestore for data storage`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
