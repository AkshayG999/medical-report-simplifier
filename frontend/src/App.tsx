/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Activity, FileText, LogOut, Loader2, RefreshCcw } from "lucide-react";
import { auth, createPasswordAccount, signInWithGoogle, signInWithPassword, signOutUser } from "@/lib/firebase";
import {
  analyzeReport,
  downloadReportSummaryPdf,
  getAllReports,
  getReportById,
  saveReport as saveReportToAPI,
  SavedReport,
  deleteReport,
} from "@/lib/api";
import { ProcessingPage } from "@/pages/ProcessingPage";
import { LoginPage } from "@/pages/LoginPage";
import { ReportResultPage } from "@/pages/ReportResultPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SavedReportPage } from "@/pages/SavedReportPage";
import { UploadPage } from "@/pages/UploadPage";
import type { LanguageOption, ReportResult } from "@/types/report";

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

function getAuthErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err !== null && "code" in err
    ? String((err as { code?: unknown }).code)
    : "";

  switch (code) {
    case "auth/operation-not-allowed":
      return "Email/password sign-in is disabled in Firebase Console. Enable Authentication > Sign-in method > Email/Password.";
    case "auth/email-already-in-use":
      return "This account already exists. Switch to Sign in and use the same email/mobile and password.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email/mobile or password.";
    case "auth/weak-password":
      return "Use a stronger password with at least 6 characters.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before it finished.";
    default:
      return err instanceof Error ? err.message : "Authentication failed. Please try again.";
  }
}

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
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [passwordSigningIn, setPasswordSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const isUploadRoute = location.pathname === "/";
  const showNewAnalysis = location.pathname === "/result" || location.pathname.startsWith("/reports");
  const isReportsRoute = location.pathname.startsWith("/reports");
  const navTabClass = (active: boolean) =>
    [
      "relative min-h-9 px-2 pb-1 transition-colors after:absolute after:left-2 after:right-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-all",
      active
        ? "text-primary-600 after:bg-primary-400 after:opacity-100"
      : "text-cocoa hover:text-primary-400 after:bg-transparent after:opacity-0",
    ].join(" ");

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      setAuthError(null);

      if (!nextUser) {
        setReports([]);
        setResult(null);
      }
    });
  }, []);

  const getUserInitials = (currentUser: User) => {
    const name = currentUser.displayName || currentUser.email || "User";
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");

    return initials || "U";
  };

  const handleSignIn = async () => {
    setGoogleSigningIn(true);
    setAuthError(null);

    try {
      await signInWithGoogle();
      navigate("/", { replace: true });
    } catch (err) {
      setAuthError(getAuthErrorMessage(err));
    } finally {
      setGoogleSigningIn(false);
    }
  };

  const handlePasswordSignIn = async (identifier: string, password: string) => {
    setPasswordSigningIn(true);
    setAuthError(null);

    try {
      await signInWithPassword(identifier, password);
      navigate("/", { replace: true });
    } catch (err) {
      const message = getAuthErrorMessage(err);
      setAuthError(message);
      throw new Error(message);
    } finally {
      setPasswordSigningIn(false);
    }
  };

  const handlePasswordSignUp = async (identifier: string, password: string, displayName: string) => {
    setPasswordSigningIn(true);
    setAuthError(null);

    try {
      await createPasswordAccount(identifier, password, displayName);
      navigate("/", { replace: true });
    } catch (err) {
      const message = getAuthErrorMessage(err);
      setAuthError(message);
      throw new Error(message);
    } finally {
      setPasswordSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    await signOutUser();
    navigate("/");
  };

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
    if (!user) {
      setError("Please sign in with your account before analyzing a report.");
      return;
    }

    setLoading(true);
    navigate("/processing");
    setError(null);

    let reportId: string | null = null;

    try {
      const reportFiles = await Promise.all(
        files.map(async (selectedFile) => ({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type,
          data: await fileToBase64(selectedFile),
        }))
      );

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
          files: reportFiles,
        });
        reportId = saveResponse.reportId;
      } catch (saveError) {
        throw new Error(
          saveError instanceof Error
            ? saveError.message
            : "Could not connect to the secure report database API. Please sign in and make sure the backend server is running."
        );
      }

      setProcessingStatus("Analyzing report securely...");
      const analysisResponse = await analyzeReport(reportId, {
        files: reportFiles,
        language,
      });

      setResult({
        simplifiedReport: analysisResponse.result.simplifiedReport,
        recommendations: analysisResponse.result.recommendations,
        insights: analysisResponse.result.insights,
        resources: analysisResponse.result.resources,
      });
      setProcessingStatus("");
      navigate("/result");
    } catch (err) {
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
    if (!user) {
      setError("Please sign in to view your saved reports.");
      if (shouldNavigate) {
        navigate("/");
      }
      return;
    }

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
  }, [navigate, user]);

  useEffect(() => {
    if (location.pathname === "/reports") {
      void loadReports(false);
    }
  }, [loadReports, location.pathname]);

  const loadSavedReport = useCallback(async (reportId: string) => {
    if (!user) {
      setError("Please sign in to open saved reports.");
      return;
    }

    setHistoryLoading(true);
    setError(null);

    try {
      const response = await getReportById(reportId);
      const report = response.report;
      setResult({
        reportId: report.id,
        simplifiedReport: report.simplifiedReport,
        recommendations: report.recommendations,
        insights: report.insights,
        resources: report.resources,
        uploadedFiles: report.files,
        fileStorageStatus: report.fileStorageStatus,
        fileStorageError: report.fileStorageError,
      });
      setLanguage(report.language);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this report.");
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  const handleDeleteReport = async (reportId: string) => {
    if (!user) {
      setError("Please sign in to delete saved reports.");
      return;
    }

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

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-primary-600">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }

  const authRoute = (
    <LoginPage
      googleLoading={googleSigningIn}
      passwordLoading={passwordSigningIn}
      error={authError}
      onGoogleSignIn={handleSignIn}
      onPasswordSignIn={handlePasswordSignIn}
      onPasswordSignUp={handlePasswordSignUp}
    />
  );

  if (!user) {
    return (
      <Routes location={location} key={location.pathname}>
        <Route path="/auth" element={authRoute} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-hidden text-ink font-sans selection:bg-accent-100 selection:text-accent-900">
      <header className="border-b border-primary-100 bg-white/90 backdrop-blur sticky top-0 z-50">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-5 lg:px-6">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-400 text-primary-50 shadow-sm shadow-primary-100">
              <Activity size={22} />
            </div>
            <h1 className="truncate text-base font-extrabold tracking-tight text-ink sm:text-xl">MedInsight AI</h1>
          </motion.div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-bold">
            <button type="button" onClick={() => navigate("/")} className={navTabClass(!isReportsRoute)}>Dashboard</button>
            <button type="button" onClick={() => loadReports()} className={navTabClass(isReportsRoute)}>Reports</button>
            <button type="button" className={navTabClass(false)}>Resources</button>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <AnimatePresence mode="popLayout">
              {isUploadRoute && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => loadReports()}
                  disabled={historyLoading}
                  className="flex h-10 items-center gap-2 rounded-lg border border-primary-100 bg-white px-3 text-sm font-extrabold text-primary-600 shadow-sm transition-all hover:bg-primary-50 disabled:opacity-50 sm:px-4"
                >
                  {historyLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  <span className="hidden sm:inline">Saved Reports</span>
                </motion.button>
              )}
              {showNewAnalysis && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={reset}
                  className="flex h-10 items-center gap-2 rounded-lg border border-primary-100 bg-white px-3 text-sm font-extrabold text-primary-600 shadow-sm transition-all hover:bg-primary-50 sm:px-4"
                >
                  <RefreshCcw size={14} />
                  <span className="hidden sm:inline">New Analysis</span>
                </motion.button>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary-100 bg-white px-1.5 py-1.5 text-sm font-bold text-ink shadow-sm transition-colors hover:bg-primary-50 sm:gap-2 sm:px-2"
              title="Sign out"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-400 text-xs font-black text-primary-50 shadow-sm shadow-primary-100">
                {getUserInitials(user)}
              </span>
              <LogOut size={15} className="text-cocoa" />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl items-center justify-between border-t border-primary-100/70 px-3 py-1.5 text-xs font-extrabold sm:px-5 md:hidden">
          <button type="button" onClick={() => navigate("/")} className={navTabClass(!isReportsRoute)}>Dashboard</button>
          <button type="button" onClick={() => loadReports()} className={navTabClass(isReportsRoute)}>Reports</button>
          <button type="button" className={navTabClass(false)}>Resources</button>
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/auth" element={<Navigate to="/" replace />} />
            <Route
              path="/"
              element={
                <UploadPage
                  files={files}
                  loading={loading}
                  error={error || authError}
                  language={language}
                  languages={languages}
                  authenticated={Boolean(user)}
                  authLoading={authLoading}
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

      <footer className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 border-t border-primary-100/70 px-3 py-5 text-center text-xs font-semibold text-clay sm:flex-row sm:px-5 sm:text-left lg:px-6">
        <p>© 2026 MedInsight AI. All rights reserved.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:justify-end">
          <button type="button" className="hover:text-primary-400 transition-colors">Privacy Policy</button>
          <button type="button" className="hover:text-primary-400 transition-colors">Terms of Service</button>
          <button type="button" className="hover:text-primary-400 transition-colors">Contact</button>
        </div>
      </footer>
    </div>
  );
}
