import { motion } from "motion/react";
import { Activity } from "lucide-react";

interface ProcessingPageProps {
  status: string;
}

export function ProcessingPage({ status }: ProcessingPageProps) {
  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="max-w-md mx-auto text-center py-24"
    >
      <div className="relative w-32 h-32 mx-auto mb-10">
        <div className="absolute inset-0 border-4 border-primary-100 rounded-[2.5rem] rotate-45"></div>
        <div className="absolute inset-0 border-4 border-primary-400 rounded-[2.5rem] border-t-transparent animate-spin rotate-45"></div>
        <div className="absolute inset-0 flex items-center justify-center text-primary-400 animate-float">
          <Activity size={48} />
        </div>
      </div>
      <h2 className="text-3xl font-extrabold text-ink mb-4 tracking-tight">
        {status || "AI is Thinking..."}
      </h2>
      <p className="text-clay font-medium leading-relaxed">
        We're extracting measurements and translating medical terminology for you.
      </p>
      <div className="mt-12 space-y-4 max-w-xs mx-auto">
        {["Scanning report structure...", "Identifying key findings...", "Simplifying medical terms...", "Preparing recommendations..."].map((text, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.5, repeat: Infinity, repeatDelay: 2 }}
            className="flex items-center gap-4 text-left text-sm font-bold text-cocoa/60"
          >
            <div className="w-2 h-2 rounded-full bg-accent-200 shadow-lg shadow-accent-100"></div>
            {text}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
