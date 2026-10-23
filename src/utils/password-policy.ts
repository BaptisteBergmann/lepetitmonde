export const PASSWORD_MIN_LENGTH = 10
// bcrypt only hashes the first 72 bytes and GoTrue rejects longer passwords.
export const PASSWORD_MAX_LENGTH = 72

export function isValidPasswordLength(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  )
}
