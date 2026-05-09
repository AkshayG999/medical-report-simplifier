/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Activity, ChevronDown, FileText, Loader2, RefreshCcw } from "lucide-react";
import { reportProcessor } from "@/src/lib/reportGraph";
import {
  downloadReportSummaryPdf,
  getAllReports,
  getReportById,
  saveReport as saveReportToAPI,
  SavedReport,
  updateReportAnalysis,
  deleteReport,
} from "@/src/lib/api";
import { ProcessingPage } from "@/src/pages/ProcessingPage";
import { ReportResultPage } from "@/src/pages/ReportResultPage";
import { ReportsPage } from "@/src/pages/ReportsPage";
import { SavedReportPage } from "@/src/pages/SavedReportPage";
import { UploadPage } from "@/src/pages/UploadPage";
import type { LanguageOption, ReportResult } from "@/src/types/report";

const languages: LanguageOption[] = [
  { name: "English", native: "English", flag: "🇬🇧" },
  { name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { name: "Marathi", native: "मराठी", flag: "🇮🇳" },
  { name: "Gujarati", native: "ગુજરાતી", flag: "🇮🇳" },
  { name: "Bengali", native: "বাংলা", flag: "🇮🇳" },
  { name: "Tamil", native: "தமிழ்", flag: "🇮🇳" },
  { name: "Telugu", native: "తెలుగు", flag: "🇮🇳" },
  { name: "Kannada", native: "ಕನ್ನಡ", flag: "🇮🇳" },
  { name: "Malayalam", native: "മലയാളം", flag: "🇮🇳" },
  { name: "Punjabi", native: "ਪੰਜਾਬੀ", flag: "🇮🇳" },
  { name: "Urdu", native: "اردو", flag: "🇮🇳" },
  { name: "Odia", native: "ଓଡ଼ିଆ", flag: "🇮🇳" },
  { name: "Assamese", native: "অসমীয়া", flag: "🇮🇳" },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("Hindi");
  const [processingStatus, setProcessingStatus] = useState("");
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  const isUploadRoute = location.pathname === "/";
  const showNewAnalysis = location.pathname === "/result" || location.pathname.startsWith("/reports");
  const isReportsRoute = location.pathname.startsWith("/reports");
  const navTabClass = (active: boolean) =>
    [
      "relative px-1 pb-1 transition-colors after:absolute after:left-0 after:right-0 after:bottom-0 after:h-0.5 after:rounded-full after:transition-all",
      active
        ? "text-primary-600 after:bg-primary-400 after:opacity-100"
        : "text-cocoa hover:text-primary-400 after:bg-transparent after:opacity-0",
    ].join(" ");

  const fileToBase64 = (fileToRead: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(fileToRead);
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = (readerError) => reject(readerError);
    });
  };

  const processReport = async () => {
    if (files.length === 0) return;

    setLoading(true);
    navigate("/processing");
    setError(null);

    let reportId: string | null = null;

    try {
      try {
        const totalFileSize = files.reduce((total, selectedFile) => total + selectedFile.size, 0);
        const fileName = files.length === 1
          ? files[0].name
          : `${files.length} files: ${files.map((selectedFile) => selectedFile.name).join(", ")}`;
        const mimeType = files.length === 1 ? files[0].type : "multiple";

        const saveResponse = await saveReportToAPI({
          fileName,
          fileSize: totalFileSize,
          mimeType,
          language,
        });
        reportId = saveResponse.reportId;
      } catch {
        throw new Error("Could not connect to the report database API. Please start the backend server and try again.");
      }

      const reportFiles = await Promise.all(
        files.map(async (selectedFile) => ({
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          data: await fileToBase64(selectedFile),
        }))
      );

      if (reportId) {
        await updateReportAnalysis(reportId, { status: "processing" });
      }

      const stream = await reportProcessor.stream({
        fileData: reportFiles[0]?.data,
        mimeType: reportFiles[0]?.mimeType,
        files: reportFiles,
        language,
      }, { streamMode: "updates" });

      let currentResult: ReportResult = {};
      let rawExtraction = "";

      for await (const chunk of stream) {
        const nodeName = Object.keys(chunk)[0];
        const data = chunk[nodeName];

        if (nodeName === "extract") {
          rawExtraction = data.rawExtraction;
          setProcessingStatus("Simplifying medical terms...");
        } else if (nodeName === "simplify") {
          currentResult = { ...currentResult, simplifiedReport: data.simplifiedReport };
          setResult(currentResult);
          navigate("/result");
          setProcessingStatus("Generating recommendations...");
        } else if (nodeName === "recommend") {
          currentResult = {
            ...currentResult,
            recommendations: data.recommendations,
            insights: data.insights,
            resources: data.resources,
          };
          setResult(currentResult);
          setProcessingStatus("");
        }
      }

      if (reportId) {
        try {
          await updateReportAnalysis(reportId, {
            status: "completed",
            rawExtraction,
            simplifiedReport: currentResult.simplifiedReport,
            recommendations: currentResult.recommendations,
            insights: currentResult.insights,
            resources: currentResult.resources,
          });
        } catch (updateError) {
          console.error("Failed to update report analysis:", updateError);
        }
      }
    } catch (err) {
      if (reportId) {
        try {
          await updateReportAnalysis(reportId, {
            status: "failed",
            errorMessage: err instanceof Error ? err.message : "Unknown error occurred",
          });
        } catch (updateError) {
          console.error("Failed to update error status:", updateError);
        }
      }

      setError(err instanceof Error ? err.message : "Failed to process the report. Please ensure the file is clear and try again.");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setResult(null);
    setError(null);
    navigate("/");
  };

  const loadReports = useCallback(async (shouldNavigate = true) => {
    setHistoryLoading(true);
    setError(null);

    try {
      const response = await getAllReports();
      setReports(response.reports);
      if (shouldNavigate) {
        navigate("/reports");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load saved reports. Please start the backend server and try again.");
    } finally {
      setHistoryLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (location.pathname === "/reports") {
      void loadReports(false);
    }
  }, [loadReports, location.pathname]);

  const loadSavedReport = useCallback(async (reportId: string) => {
    setHistoryLoading(true);
    setError(null);

    try {
      const response = await getReportById(reportId);
      const report = response.report;
      setResult({
        simplifiedReport: report.simplifiedReport,
        recommendations: report.recommendations,
        insights: report.insights,
        resources: report.resources,
      });
      setLanguage(report.language);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this report.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteReport(reportId);
      void loadReports(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this report.");
    }
  };

  const exportReportSummary = async () => {
    if (!result?.simplifiedReport) return;

    setPdfExporting(true);
    setError(null);

    try {
      const pdfBlob = await downloadReportSummaryPdf({
        language,
        summary: result.simplifiedReport,
        insights: result.insights,
        recommendations: result.recommendations,
      });

      const downloadUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);

      link.href = downloadUrl;
      link.download = `medinsight-report-summary-${date}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export report summary as PDF.");
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <div className="min-h-screen text-ink font-sans selection:bg-accent-100 selection:text-accent-900">
      <header className="border-b border-primary-100 bg-white/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-5">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-400 rounded-lg flex items-center justify-center text-primary-50 shadow-sm shadow-primary-100">
              <Activity size={22} />
            </div>
            <h1 className="font-extrabold text-xl tracking-tight text-ink">MedInsight AI</h1>
          </motion.div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-bold">
            <button type="button" onClick={() => navigate("/")} className={navTabClass(!isReportsRoute)}>Dashboard</button>
            <button type="button" onClick={() => loadReports()} className={navTabClass(isReportsRoute)}>Reports</button>
            <button type="button" className={navTabClass(false)}>Resources</button>
          </nav>

          <div className="flex items-center gap-3">
            <AnimatePresence mode="popLayout">
              {isUploadRoute && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => loadReports()}
                  disabled={historyLoading}
                  className="h-10 px-4 text-sm font-extrabold text-primary-600 bg-white hover:bg-primary-50 rounded-lg flex items-center gap-2 transition-all border border-primary-100 disabled:opacity-50 shadow-sm"
                >
                  {historyLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  Saved Reports
                </motion.button>
              )}
              {showNewAnalysis && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={reset}
                  className="h-10 px-4 text-sm font-extrabold text-primary-600 bg-white hover:bg-primary-50 rounded-lg flex items-center gap-2 transition-all border border-primary-100 shadow-sm"
                >
                  <RefreshCcw size={14} />
                  New Analysis
                </motion.button>
              )}
            </AnimatePresence>
            <button type="button" className="hidden sm:flex items-center gap-2 text-sm font-bold text-ink">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-400 text-sm font-black text-primary-50 shadow-sm shadow-primary-100">
                AK
              </span>
              <ChevronDown size={16} className="text-cocoa" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 relative z-10">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route
              path="/"
              element={
                <UploadPage
                  files={files}
                  loading={loading}
                  error={error}
                  language={language}
                  languages={languages}
                  onFilesSelected={(selectedFiles) => {
                    setFiles(selectedFiles);
                    setError(null);
                  }}
                  onLanguageChange={setLanguage}
                  onProcessReport={processReport}
                />
              }
            />
            <Route path="/processing" element={<ProcessingPage status={processingStatus} />} />
            <Route
              path="/reports"
              element={
                <ReportsPage
                  reports={reports}
                  loading={historyLoading}
                  error={error}
                  onBack={() => {
                    setError(null);
                    navigate("/");
                  }}
                  onOpenReport={(reportId) => navigate(`/reports/${reportId}`)}
                  onDeleteReport={handleDeleteReport}
                />
              }
            />
            <Route
              path="/result"
              element={result ? (
                <ReportResultPage
                  result={result}
                  error={error}
                  source="analysis"
                  exporting={pdfExporting}
                  onBackToReports={() => navigate("/reports")}
                  onExportPdf={exportReportSummary}
                />
              ) : <Navigate to="/" replace />}
            />
            <Route
              path="/reports/:reportId"
              element={
                <SavedReportPage
                  loadReport={loadSavedReport}
                  loading={historyLoading}
                  result={result}
                  error={error}
                  exporting={pdfExporting}
                  onBackToReports={() => {
                    setError(null);
                    navigate("/reports");
                  }}
                  onExportPdf={exportReportSummary}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-6 border-t border-primary-100/70 relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-clay">
        <p>© 2026 MedInsight AI. All rights reserved.</p>
        <div className="flex items-center gap-8">
          <button type="button" className="hover:text-primary-400 transition-colors">Privacy Policy</button>
          <button type="button" className="hover:text-primary-400 transition-colors">Terms of Service</button>
          <button type="button" className="hover:text-primary-400 transition-colors">Contact</button>
        </div>
      </footer>
    </div>
  );
}
