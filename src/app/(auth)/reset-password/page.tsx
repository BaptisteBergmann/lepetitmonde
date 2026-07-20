import { ResetPasswordForm } from "@components/reset-password-form"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams
  return <ResetPasswordForm message={message} />
}
