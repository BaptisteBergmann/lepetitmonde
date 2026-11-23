import { LoginForm } from "@components/login-form"
import { UnsyncedNotice } from "./_components/unsynced_notice"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; redirectTo?: string }>
}) {
  const { message, redirectTo } = await searchParams
  return (
    <div className="flex flex-col gap-4">
      <UnsyncedNotice />
      <LoginForm message={message} redirectTo={redirectTo} />
    </div>
  )
}
