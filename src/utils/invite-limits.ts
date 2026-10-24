// Allowed lifetimes (hours) for generated invitation links. Pure module so the
// UI can import it too.
export const INVITE_DURATIONS_HOURS = [24, 72, 168] as const

export type InviteDurationHours = (typeof INVITE_DURATIONS_HOURS)[number]

export function isInviteDurationHours(value: unknown): value is InviteDurationHours {
  return typeof value === 'number' && (INVITE_DURATIONS_HOURS as readonly number[]).includes(value)
}
