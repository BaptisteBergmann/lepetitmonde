// Text length caps for feed content. Kept in a dependency-free module so
// client inputs can set matching `maxLength` attributes; the server enforces
// them in feed-validation.ts.
export const FEED_LIMITS = {
  comment: 2000,
  postCaption: 2000,
  storyCaption: 500,
  groupLabel: 50,
  pollQuestion: 200,
  pollOption: 100,
  highlightName: 50,
} as const
