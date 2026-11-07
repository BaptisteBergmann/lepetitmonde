---
tags: [lepetitmonde/feature]
---

# To-do list

Up: [[Le petit monde]] · Route: `/baby/[babyId]/todo` · Code: `todo/`, `actions/todo.ts`, `todo-core.ts`

A simple admin-only to-do list per baby: create, edit, tick done, delete and reorder items.

It was the first feature exposed through the [[MCP server]] (`list_todos`, `add_todo`, `set_todo_done`, `delete_todo`, `move_todo`), which is why its rules live in a [[Core modules|core module]].

Table: `todo_items`.
