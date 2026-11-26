import { redirect } from "next/navigation";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getTodoItems, getTodoLists } from "@/utils/actions/todo";
import Checklist from "../../_components/checklist";
import ListHeader from "../../_components/list_header";

export default async function TodoListPage({
  params,
}: {
  params: Promise<{ babyId: string; listId: string }>;
}) {
  const { babyId, listId } = await params;

  await assertPageAccess(babyId, 'todo');

  const lists = await getTodoLists(babyId);
  const list = lists.find((candidate) => candidate.id === listId);
  // Unknown, deleted or another baby's list: back to the index with the same answer for
  // all three, never a 404 that says it exists.
  if (!list) redirect(`/baby/${babyId}/todo?gone=1`);

  const allItems = await getTodoItems(babyId);
  const items = allItems.filter((item) => item.list_id === list.id);

  return (
    <>
      <ListHeader
        key={list.id}
        babyId={babyId}
        listId={list.id}
        name={list.name}
        itemCount={items.length}
      />
      {/* Remounted per list so the editor never carries rows over from another one. */}
      <Checklist key={list.id} babyId={babyId} listId={list.id} items={items} />
    </>
  );
}
