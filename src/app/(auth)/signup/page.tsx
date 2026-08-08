import { redirect } from "next/navigation"

// Invite links now point at /invite; this keeps already-sent /signup?token=...
// links (emails, old shares) working by forwarding to the new route.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const params = await searchParams
  const query = new URLSearchParams(params).toString()
  redirect(query ? `/invite?${query}` : '/invite')
}
