'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { isSharePath, toRouteTemplate } from '@/utils/vitals-path'

// Reports Core Web Vitals (TTFB, LCP, INP, CLS, FCP) to /api/vitals, which
// logs them via Pino — same idea as the server-side timing logs, but for
// what the browser actually experienced.
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    // Share URLs carry the token in the path: never report from them.
    if (isSharePath(window.location.pathname)) return

    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      path: toRouteTemplate(window.location.pathname),
    })

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/vitals', body)
    } else {
      fetch('/api/vitals', { method: 'POST', body, keepalive: true })
    }
  })

  return null
}
