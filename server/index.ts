import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';
import { initializeDatabase, saveReport, updateReportAnalysis, getAllReports, getReportById, deleteReport } from './db.js';
import { buildReportSummaryPdfHtml, ingestReportSummaryContent } from '../src/lib/pdfExport.ts';

const app = express();
const PORT = Number(process.env.PORT || 3001);
const VALID_STATUSES = new Set(['pending', 'processing', 'completed', 'failed']);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API Routes

// Save initial report (before AI processing)
app.post('/api/reports', async (req, res) => {
  try {
    const { fileName, fileSize, mimeType, language, fileData } = req.body;

    if (typeof fileName !== 'string' || fileName.trim() === '') {
      return res.status(400).json({ success: false, error: 'fileName is required' });
    }

    if (typeof fileSize !== 'number' || fileSize < 0) {
      return res.status(400).json({ success: false, error: 'fileSize must be a non-negative number' });
    }

    if (typeof mimeType !== 'string' || mimeType.trim() === '') {
      return res.status(400).json({ success: false, error: 'mimeType is required' });
    }

    const reportId = await saveReport({
      fileName: fileName.trim(),
      fileSize,
      mimeType: mimeType.trim(),
      language: language || 'English',
      fileData,
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

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: 'Invalid report status' });
    }

    const success = await updateReportAnalysis(req.params.id, {
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
    const reports = await getAllReports();
    res.json({ success: true, reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reports' });
  }
});

// Get a specific report by ID
app.get('/api/reports/:id', async (req, res) => {
  try {
    const report = await getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    res.json({ success: true, report });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
});

// Delete a report by ID
app.delete('/api/reports/:id', async (req, res) => {
  try {
    const success = await deleteReport(req.params.id);
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
