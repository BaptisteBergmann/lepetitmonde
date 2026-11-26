import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getTodoItems, getTodoLists } from "@/utils/actions/todo";
import Checklist from "../_components/checklist";
import ListChips from "../_components/list_chips";
import ListHeader from "../_components/list_header";

export default async function TodoListPage({
  params,
}: {
  params: Promise<{ babyId: string; listId: string }>;
}) {
  const { babyId, listId } = await params;
  const t = await getTranslations('todo.lists');

  await assertPageAccess(babyId, 'todo');

  const lists = await getTodoLists(babyId);
  const list = lists.find((candidate) => candidate.id === listId);
  // Unknown, deleted or another baby's list: back to the index with the same answer for
  // all three, never a 404 that says it exists.
  if (!list) redirect(`/baby/${babyId}/todo?gone=1`);

  const allItems = await getTodoItems(babyId);
  const items = allItems.filter((item) => item.list_id === list.id);

  const chips = lists.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    openCount: allItems.filter((item) => item.list_id === candidate.id && !item.done).length,
  }));

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
        <ListChips babyId={babyId} lists={chips} activeId={list.id} />
        <ListHeader
          key={list.id}
          babyId={babyId}
          listId={list.id}
          name={list.name}
          itemCount={items.length}
        />
        {/* Remounted per list so the editor never carries rows over from another one. */}
        <Checklist key={list.id} babyId={babyId} listId={list.id} items={items} />
      </div>
    </div>
  );
}
