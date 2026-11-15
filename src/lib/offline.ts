/** Turn a browser network failure into an actionable message. */
export function describeFetchError(error: unknown, feature: string): string {
  if (error instanceof TypeError) {
    return `${feature} needs the analysis server, which is not reachable. Start it with "uvicorn app.main:app" in the backend folder, then try again.`;
  }
  return error instanceof Error ? error.message : `${feature} is unavailable.`;
}
