'use client'

import { useReportWebVitals } from 'next/web-vitals'

// Reports Core Web Vitals (TTFB, LCP, INP, CLS, FCP) to /api/vitals, which
// logs them via Pino — same idea as the server-side timing logs, but for
// what the browser actually experienced.
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      path: window.location.pathname,
    })

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/vitals', body)
    } else {
      fetch('/api/vitals', { method: 'POST', body, keepalive: true })
    }
  })

  return null
}
