'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '@/utils/logger'
import { assertIsAdmin, getBabyMemberEmails } from './access'
import { sendFairePartEmail } from '@/utils/email'
import { actionError } from './errors'

export async function sendFairePart(formData: FormData) {
  const babyId = formData.get('babyId') as string
  const message = (formData.get('message') as string | null)?.trim()
  const photo = formData.get('photo') as File | null
  const contextLogger = logger.child({ function: sendFairePart.name, babyId })

  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  if (!message) throw await actionError('fairePartMessageRequired')

  const { data: baby, error: babyError } = await supabase
    .from('babies')
    .select('baby_surname')
    .eq('id', babyId)
    .single()

  if (babyError) {
    contextLogger.error(babyError, "Error fetching baby for faire-part email")
    throw await actionError('fairePartError')
  }

  const recipients = await getBabyMemberEmails(babyId)

  const attachment = photo && photo.size > 0
    ? { filename: photo.name, content: Buffer.from(await photo.arrayBuffer()) }
    : undefined

  await Promise.all(
    recipients.map((to) => sendFairePartEmail(to, baby.baby_surname, message, attachment))
  )

  contextLogger.info({ sentCount: recipients.length }, "Faire-part emails sent")

  return { sentCount: recipients.length }
}
