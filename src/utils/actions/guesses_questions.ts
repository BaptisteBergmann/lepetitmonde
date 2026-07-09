'use server' // Obligatoire pour définir que ce fichier contient des Server Actions

import { createClient } from '@utils/supabase/server'
import { TablesInsert } from '@utils/supabase/database.types'

export async function getQuestions(babyId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  const { data, error } = await supabase
    .from('guess_questions')
    .select("*")
    .eq('baby_id', babyId);

  if (error) { console.error(error); return [] }
  console.log(data)
  return data
}



type NewGuess = TablesInsert<'guess_questions'>;

export async function addQuestion(formData: NewGuess) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Non autorisé")

  // 4. Insérer dans la base de données
  console.log("ADD question", formData)
  const rep = await supabase
    .from('guess_questions')
    .insert(formData)

  if (rep.error) { console.error(rep.error); return rep }
  console.log("ADDED question")
  return rep

}
