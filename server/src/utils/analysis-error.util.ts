export function getSafeAnalysisErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');

  if (/429|quota|too many requests|rate limit/i.test(message)) {
    return 'AI analysis quota was reached. Please try again later.';
  }

  if (/api key|permission|unauthorized|forbidden|billing/i.test(message)) {
    return 'AI analysis is temporarily unavailable. Please check the server configuration.';
  }

  if (/timeout|deadline|network|fetch/i.test(message)) {
    return 'AI analysis timed out. Please try again.';
  }

  return 'AI analysis failed. Please try again.';
}
