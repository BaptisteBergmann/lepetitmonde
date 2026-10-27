'use server'

import { createClient } from '@utils/supabase/server'
import { actionError } from './errors'
import { addTodo, deleteTodo, listTodos, moveTodo, renameTodo, setTodoDone } from '../todo-core'

// Thin wrappers: session check here, access check and queries in todo-core
// (shared with the MCP endpoint).
async function getSessionClient() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw await actionError('unauthorized')
  return { supabase, userId: user.id }
}

export async function getTodoItems(babyId: string) {
  const { supabase, userId } = await getSessionClient()
  return listTodos(supabase, userId, babyId)
}

// Only the picked fields are forwarded: spreading the client's object would
// let it set created_by, position, done or even baby_id.
export async function createTodoItem(payload: { baby_id: string; title: string }) {
  const babyId = payload?.baby_id
  if (typeof babyId !== 'string') throw await actionError('invalidInput')

  const { supabase, userId } = await getSessionClient()
  await addTodo(supabase, userId, babyId, payload.title)
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
