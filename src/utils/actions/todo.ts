'use server'

import { getTranslations } from 'next-intl/server'
import { createClient } from '@utils/supabase/server'
import { actionError } from './errors'
import {
  addTodo, addTodos, clearDoneTodos, createTodoList as createTodoListCore, deleteTodo,
  deleteTodoList as deleteTodoListCore, listTodoLists, listTodos, moveTodo, renameTodo,
  renameTodoList, setTodoDone,
} from '../todo-core'

// Thin wrappers: session check here, access check and queries in todo-core
// (shared with the MCP endpoint).
async function getSessionClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')
  return { supabase, userId: user.id }
}

export async function getTodoLists(babyId: string) {
  const { supabase, userId } = await getSessionClient()
  const t = await getTranslations('todo.lists')
  return listTodoLists(supabase, userId, babyId, { defaultName: t('defaultName') })
}

export async function createTodoList(babyId: string, name: string) {
  const { supabase, userId } = await getSessionClient()
  return createTodoListCore(supabase, userId, babyId, { name })
}

export async function updateTodoList(babyId: string, listId: string, fields: { name: string }) {
  const { supabase, userId } = await getSessionClient()
  await renameTodoList(supabase, userId, babyId, listId, { name: fields?.name })
}

export async function deleteTodoList(babyId: string, listId: string) {
  const { supabase, userId } = await getSessionClient()
  await deleteTodoListCore(supabase, userId, babyId, listId)
}

export async function getTodoItems(babyId: string, listId?: string) {
  const { supabase, userId } = await getSessionClient()
  return listTodos(supabase, userId, babyId, { listId })
}

// Items are validated in the core (shape, uuid, length, at most 100): the client
// only gets to choose ids and titles.
export async function createTodoItems(babyId: string, listId: string, items: { id?: string; title: string }[], afterId?: string) {
  const { supabase, userId } = await getSessionClient()
  await addTodos(supabase, userId, babyId, listId, items, { afterId })
}

export async function clearDoneTodoItems(babyId: string, listId: string) {
  const { supabase, userId } = await getSessionClient()
  await clearDoneTodos(supabase, userId, babyId, listId)
}

// Only the picked fields are forwarded: spreading the client's object would
// let it set created_by, position, done or even baby_id.
export async function createTodoItem(payload: { baby_id: string; title: string }) {
  const babyId = payload?.baby_id
  if (typeof babyId !== 'string') throw await actionError('invalidInput')

  const { supabase, userId } = await getSessionClient()
  const t = await getTranslations('todo.lists')
  await addTodo(supabase, userId, babyId, payload.title, { defaultName: t('defaultName') })
}

export async function updateTodoItem(babyId: string, itemId: string, fields: { title: string }) {
  const { supabase, userId } = await getSessionClient()
  await renameTodo(supabase, userId, babyId, itemId, fields?.title)
}

export async function toggleTodoItem(babyId: string, itemId: string, done: boolean) {
  const { supabase, userId } = await getSessionClient()
  await setTodoDone(supabase, userId, babyId, itemId, done)
}

export async function deleteTodoItem(babyId: string, itemId: string) {
  const { supabase, userId } = await getSessionClient()
  await deleteTodo(supabase, userId, babyId, itemId)
}

export async function moveTodoItem(babyId: string, itemId: string, direction: 'up' | 'down') {
  const { supabase, userId } = await getSessionClient()
  await moveTodo(supabase, userId, babyId, itemId, direction)
}
