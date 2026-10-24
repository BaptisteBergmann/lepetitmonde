// Read at runtime on the server (never a build arg). Off in production unless
// opted in: /api/vitals is unauthenticated, so by default the public endpoint
// does nothing and the reporter is not mounted.
export function isWebVitalsEnabled() {
  return process.env.NODE_ENV !== 'production' || process.env.WEB_VITALS_ENABLED === 'true'
}
