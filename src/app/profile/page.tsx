import Link from 'next/link'

export default async function Profile() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-background font-sans">
      <Link href="/settings">Paramètres</Link>
      bonjour
    </div>
  );
}
