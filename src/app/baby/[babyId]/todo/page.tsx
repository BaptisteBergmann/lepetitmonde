import { getTranslations } from "next-intl/server";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getTodoItems, getTodoLists } from "@/utils/actions/todo";
import { Reveal } from "@components/reveal";
import ListCard from "./_components/list_card";
import ListForm from "./_components/list_form";

// Lists index. The first load of a baby creates its default list, so there is always
// at least one card.
export default async function TodoPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  const t = await getTranslations('todo');

  await assertPageAccess(babyId, 'todo');

  const lists = await getTodoLists(babyId);
  const items = await getTodoItems(babyId);
  const openCount = items.filter((item) => !item.done).length;

  return (
    <div className="text-landing-foreground">
      <div className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
        <Reveal className="mb-6">
          <h1 tabIndex={-1} data-todo-index-heading className="font-display text-3xl font-semibold outline-none">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-landing-muted">
            {openCount === 0 ? t('allDone') : t('summary', { open: openCount, lists: lists.length })}
          </p>
        </Reveal>

        <div className="flex flex-col gap-3">
          {lists.map((list) => (
            <ListCard
              key={list.id}
              babyId={babyId}
              list={list}
              items={items.filter((item) => item.list_id === list.id)}
            />
          ))}
          <ListForm babyId={babyId} />
        </div>
      </div>
    </div>
  );
}
