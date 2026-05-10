import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, ArrowLeft, ChevronRight, FileText, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedReport } from "@/lib/api";

interface ReportsPageProps {
  reports: SavedReport[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onOpenReport: (reportId: string) => void;
  onDeleteReport: (reportId: string) => void;
}

function getReportErrorText(report: SavedReport): string {
  const message = report.errorMessage || "Analysis failed. Please try again.";

  if (/quota|too many requests|429|rate limit/i.test(message)) {
    return "AI quota reached. Please retry later.";
  }

  if (/api key|permission|unauthorized|forbidden|billing/i.test(message)) {
    return "AI service is temporarily unavailable.";
  }

  if (/timeout|deadline|network|fetch/i.test(message)) {
    return "Analysis timed out. Please retry.";
  }

  if (message.length > 140 || message.includes("https://") || message.includes("{")) {
    return "Analysis failed. Please retry.";
  }

  return message;
}

export function ReportsPage({ reports, loading, error, onBack, onOpenReport, onDeleteReport }: ReportsPageProps) {
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      className="max-w-4xl mx-auto"
    >
      <div className="mb-8 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="h-9 px-2 -ml-2 rounded-md text-sm font-bold text-cocoa hover:text-primary-400 hover:bg-primary-50 transition-colors flex items-center gap-1.5 w-fit"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div>
          <h2 className="text-3xl font-extrabold text-ink mb-3 tracking-tight">Saved Reports</h2>
          <p className="text-clay font-medium">
            Open a completed report to view the saved summary, recommendations, and resources.
          </p>
        </div>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-4 text-rose-700 shadow-sm"
        >
          <AlertCircle className="shrink-0 mt-0.5" size={20} />
          <p className="text-sm font-medium leading-relaxed">{error}</p>
        </motion.div>
      )}

      {loading ? (
        <div className="bg-white border border-primary-100 rounded-[2rem] p-10 flex items-center justify-center gap-3 text-clay font-bold">
          <Loader2 className="animate-spin text-primary-400" />
          Loading saved reports...
        </div>
      ) : reports.length > 0 ? (
        <div className="space-y-4">
          {reports.map((report) => (
            <div
              key={report.id}
              className="w-full text-left bg-white border border-primary-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-primary-200 transition-all grid grid-cols-1 gap-4 cursor-pointer group relative sm:grid-cols-[minmax(0,1fr)_auto]"
              onClick={() => onOpenReport(report.id)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-400 flex items-center justify-center shrink-0">
                    <FileText size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-ink truncate">{report.fileName}</h3>
                    <p className="text-xs font-bold uppercase tracking-widest text-clay/60">
                      {report.language} - {(report.fileSize / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                {report.status === "failed" && (
                  <div className="mt-3 flex max-w-2xl items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-rose-700">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <p className="max-h-10 overflow-hidden text-sm font-semibold leading-5">{getReportErrorText(report)}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 shrink-0">
                <span className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold border capitalize",
                  report.status === "completed" && "bg-emerald-50 text-emerald-600 border-emerald-100",
                  report.status === "failed" && "bg-rose-50 text-rose-600 border-rose-100",
                  report.status === "processing" && "bg-accent-50 text-accent-600 border-accent-100",
                  report.status === "pending" && "bg-primary-50 text-clay border-primary-100"
                )}>
                  {report.status}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setReportToDelete(report.id);
                  }}
                  className="p-2 -mr-2 text-clay/40 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete report"
                >
                  <Trash2 size={18} />
                </button>
                <ChevronRight size={18} className="text-clay/60" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-primary-100 rounded-[2rem] p-10 text-center">
          <FileText size={36} className="mx-auto text-primary-100 mb-4" />
          <h3 className="font-bold text-ink mb-2">No saved reports yet</h3>
          <p className="text-sm text-clay font-medium">Run an analysis first, then it will appear here.</p>
        </div>
      )}

      <AnimatePresence>
        {reportToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/20 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full border border-primary-100"
            >
              <h3 className="text-xl font-bold text-ink mb-2">Delete Report</h3>
              <p className="text-clay font-medium mb-6">
                Are you sure you want to delete this saved report? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setReportToDelete(null)}
                  className="px-4 py-2 text-sm font-bold text-clay hover:text-ink hover:bg-primary-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteReport(reportToDelete);
                    setReportToDelete(null);
                  }}
                  className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-800 rounded-lg transition-colors shadow-sm"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
