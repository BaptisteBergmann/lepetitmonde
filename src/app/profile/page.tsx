import Link from 'next/link'

export default async function Profile() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <Link href="/settings">Blog</Link>
      hello
    </div>
  );
}
