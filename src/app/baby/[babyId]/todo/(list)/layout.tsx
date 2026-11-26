import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import ListSwitcher from "../_components/list_switcher";

// Shared by every list page and kept mounted when switching lists, so only the list
// below the chips reloads. The chips stream in behind their own skeleton.
export default async function TodoListLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  const t = await getTranslations('todo.lists');

  return (
    <div className="text-landing-foreground">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:py-12">
        <Link
          href={`/baby/${babyId}/todo`}
          className="-ml-1 flex min-h-11 w-fit items-center gap-1 text-sm text-landing-muted hover:text-landing-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t('back')}
        </Link>
        <Suspense fallback={<ChipsSkeleton />}>
          <ListSwitcher babyId={babyId} />
        </Suspense>
        {children}
      </div>
    </div>
  );
}

function ChipsSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-11 w-24 rounded-full bg-landing-border" />
      ))}
    </div>
  );
}
