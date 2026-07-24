import { LoginForm } from "@components/login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; redirectTo?: string }>
}) {
  const { message, redirectTo } = await searchParams
  return <LoginForm message={message} redirectTo={redirectTo} />
}
