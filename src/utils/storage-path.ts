const UNSAFE_SEGMENTS = new Set(['', '.', '..'])

// Guards against path traversal when a storage path built from user-supplied
// segments is later joined into a URL: `encodeURIComponent('..')` round-trips
// as `..`, and `fetch` normalises dot-segments, so an unfiltered `..` segment
// can escape the intended bucket/prefix.
export function hasUnsafePathSegment(segments: string[]): boolean {
  return segments.some((segment) => UNSAFE_SEGMENTS.has(segment) || segment.includes('/') || segment.includes('\\'))
}
