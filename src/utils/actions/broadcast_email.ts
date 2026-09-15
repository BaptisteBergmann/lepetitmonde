'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '@/utils/logger'
import { assertIsAdmin, getBabyMemberEmails } from './access'
import { sendBroadcastEmail } from '@/utils/email'
import { actionError } from './errors'

export async function sendBroadcast(formData: FormData) {
  const babyId = formData.get('babyId') as string
  const subject = (formData.get('subject') as string | null)?.trim()
  const message = (formData.get('message') as string | null)?.trim()
  const photo = formData.get('photo') as File | null
  const contextLogger = logger.child({ function: sendBroadcast.name, babyId })

  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  if (!subject) throw await actionError('broadcastSubjectRequired')
  if (!message) throw await actionError('broadcastMessageRequired')

  const { data: baby, error: babyError } = await supabase
    .from('babies')
    .select('baby_surname')
    .eq('id', babyId)
    .single()

  if (babyError) {
    contextLogger.error(babyError, "Error fetching baby for broadcast email")
    throw await actionError('broadcastError')
  }

  const recipients = await getBabyMemberEmails(babyId)

  const attachment = photo && photo.size > 0
    ? { filename: photo.name, content: Buffer.from(await photo.arrayBuffer()) }
    : undefined

  await Promise.all(
    recipients.map((to) => sendBroadcastEmail(to, baby.baby_surname, subject, message, attachment))
  )

  contextLogger.info({ sentCount: recipients.length }, "Broadcast emails sent")

  return { sentCount: recipients.length }
}
