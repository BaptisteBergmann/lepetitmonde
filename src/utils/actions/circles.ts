'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { createClient } from '@utils/supabase/server'
import { Tables, TablesInsert } from '@utils/supabase/database.types'
import { revalidatePath } from 'next/cache'
import { assertIsAdmin } from './access'

type NewCircle = TablesInsert<'circles'>;

export async function createCircle(circle: FormData) {
  const supabase = await createClient()

  const babyId = circle.get("babyId") as string
  const name = circle.get("name") as string

  await assertIsAdmin(supabase, babyId)

  const rep = await supabase
    .from('circles')
    .insert([{ name, baby_id: babyId }])

  if (rep.error) throw rep.error

  revalidatePath(`/baby/${babyId}/admin`)
}

export async function deleteCircle(circleId: string, babyId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  await supabase
    .from('circles_access')
    .delete()
    .eq('circle_id', circleId)
    .eq('baby_id', babyId)

  const rep = await supabase
    .from('circles')
    .delete()
    .eq('id', circleId)
    .eq('baby_id', babyId)

  if (rep.error) throw rep.error

  revalidatePath(`/baby/${babyId}/admin`)
}

type Circle = Tables<'circles'>;

export async function getCircles(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const rep = await supabase
    .from('circles')
    .select("*")
    .eq('baby_id', babyId);


  if (rep.error) throw rep.error
  return rep.data
}

export async function getCirclesAccess(babyId: string, userId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const rep = await supabase
    .from('circles_access')
    .select("*")
    .eq('baby_id', babyId)
    .eq('user_id', userId)
    ;


  if (rep.error) throw rep.error
  return rep.data
}

export async function getAllCirclesAccess(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const rep = await supabase
    .from('circles_access')
    .select("*")
    .eq('baby_id', babyId);

  if (rep.error) throw rep.error
  return rep.data
}

export async function addUserToCircle(circleId: string, userId: string, babyId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const rep = await supabase
    .from('circles_access')
    .insert([{ circle_id: circleId, user_id: userId, baby_id: babyId }])

  if (rep.error) throw rep.error

  revalidatePath(`/baby/${babyId}/admin`)
}

export async function removeUserFromCircle(circleId: string, userId: string, babyId: string) {
  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const rep = await supabase
    .from('circles_access')
    .delete()
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .eq('baby_id', babyId)

  if (rep.error) throw rep.error

  revalidatePath(`/baby/${babyId}/admin`)
}
