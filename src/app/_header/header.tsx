import BabySelector from '@/components/baby-selector';
import { getAllUserAccess } from '@/utils/actions/users';
import { logger } from '@/utils/logger';
import Link from 'next/link';
import PageSelector from './page_selector';



export default async function Header({
  babies,
  params }) {
  const contextLogger = logger.child({ function: Header.name })
  contextLogger.debug(babies)

  const allUserAccess = await getAllUserAccess()

  const pages = [
    { id: "guess", name: "Pronostics", role: "viewer", enabled: true },
    { id: "circles", name: "Groupes", role: "admin", enabled: true },
    { id: "calendar", name: "Calendrie", role: "viewer", enabled: false },
    { id: "news", name: "Newsletter", role: "viewer", enabled: false },
  ]
  contextLogger.debug(allUserAccess, "User access")
  const accesses = allUserAccess.map((acc) => ({
    ...acc,
    allowedPages: pages.filter((page) =>
      acc.access_level === "admin" || (acc.access_level === page.role && page.enabled)
    )
  }
  ))

  contextLogger.debug(accesses, "User accesses")

  return (
    <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <Link href="/" className="text-xl font-black text-primary cursor-pointer hover:opacity-80 transition-opacity">
        Le petit Monde
      </Link>

      <BabySelector babies={babies}></BabySelector>

      <PageSelector access={accesses} />

      <div className="flex items-center gap-2">
        <Link href="/"
          className="w-9 h-9 rounded-full bg-gray-200 ml-2 border border-gray-300 cursor-pointer hover:bg-gray-300 transition-colors"
        >
        </Link>
      </div>
    </header>
  );
}
