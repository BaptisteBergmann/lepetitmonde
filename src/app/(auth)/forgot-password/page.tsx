import { ForgotPasswordForm } from "@components/forgot-password-form"

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>
}) {
  const { message } = await searchParams
  return <ForgotPasswordForm message={message} />
}
