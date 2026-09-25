import { getTranslations } from "next-intl/server";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getTodoItems } from "@/utils/actions/todo";
import TodoModal from "./_components/todo_modal";
import TodoList from "./_components/todo_list";
import { Reveal } from "@components/reveal";

export default async function TodoPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  const t = await getTranslations('todo');

  await assertPageAccess(babyId, 'todo');

  const items = await getTodoItems(babyId);
  const doneCount = items.filter((item) => item.done).length;

  return (
    <div className="text-landing-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <Reveal className="border-b border-landing-border pb-6 mb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-semibold">
                {t('title')}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">
                {t('subtitle')}
              </p>
              {items.length > 0 && (
                <p className="mt-2 text-sm font-semibold text-landing-foreground">
                  {t('progress', { done: doneCount, total: items.length })}
                </p>
              )}
            </div>
            <div className="flex shrink-0">
              <TodoModal babyId={babyId} />
            </div>
          </div>
        </Reveal>

        <TodoList babyId={babyId} items={items} />
      </div>
    </div>
  );
}
