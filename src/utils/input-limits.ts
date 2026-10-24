// Length and range caps for Server Action input. Kept in a dependency-free
// module so client inputs can set matching `maxLength` attributes; the server
// enforces them via normalizeText / input-validation.ts.
export const INPUT_LIMITS = {
  todoTitle: 200,
  inventoryKind: 50,
  inventoryName: 200,
  inventorySize: 50,
  inventoryDetail: 1000,
  inventoryPurchasedFrom: 200,
  inventoryQuantityMax: 9999,
  inventoryPriceMax: 1_000_000,
  eventTitle: 200,
  eventDescription: 2000,
  anecdoteContent: 5000,
  circleName: 50,
  pronosticTitle: 200,
  pronosticDescription: 1000,
  pronosticChoice: 100,
  pronosticChoicesMin: 2,
  pronosticChoicesMax: 20,
  personName: 50,
  nickname: 50,
  relationToBaby: 50,
  bugReportDescription: 5000,
  userAgent: 512,
} as const
