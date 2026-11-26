import { assertPageAccess } from "@/utils/actions/page_settings";
import { getTodoItems, getTodoLists } from "@/utils/actions/todo";
import ListChips from "./list_chips";

// Server half of the chip strip: lists with their open counts. The active chip comes
// from the URL on the client, so this does not re-render when switching lists.
export default async function ListSwitcher({ babyId }: { babyId: string }) {
  await assertPageAccess(babyId, 'todo');

  const lists = await getTodoLists(babyId);
  const items = await getTodoItems(babyId);

  const chips = lists.map((list) => ({
    id: list.id,
    name: list.name,
    openCount: items.filter((item) => item.list_id === list.id && !item.done).length,
  }));

  return <ListChips babyId={babyId} lists={chips} />;
}
