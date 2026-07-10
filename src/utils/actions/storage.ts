'use server'

import { createClient } from '@utils/supabase/server'

export async function getImage(babyId: string, imageId: string) {
  const supabase = await createClient();

  const rep = await supabase.storage.from(babyId).createSignedUrl(`images/${imageId}`, 60)

  if (rep.error) { console.log("Error geting the image", rep.error); return [] }

  return rep.data;
}

