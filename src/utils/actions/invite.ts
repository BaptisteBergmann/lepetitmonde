'use server'

import { createClient } from '@utils/supabase/server'

export async function sendInvite(formData: FormData) {
  const email = formData.get('email') as string
  const babyId = formData.get('babyId') as string

  const supabase = await createClient()

  // Insertion dans la table invitations
  const rep = await supabase
    .from('invitations')
    .insert([{ email, baby_id: babyId, role }])

  if (rep.error) throw new Error("Erreur lors de l'invitation")

}


export async function generateShortLivedLink(babyId: string, hoursValid: number = 24) {
  const supabase = await createClient();

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hoursValid);

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      baby_id: babyId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id')
    .single();

  if (error) { console.log("Error generating link", error); return }

  const shareableLink = `${process.env.NEXT_PUBLIC_SITE_URL}/signup?token=${data.id}`;

  return shareableLink;
}
