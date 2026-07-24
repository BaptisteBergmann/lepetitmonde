'use server'

import { createClient } from '@utils/supabase/server'
import { logger } from '@/utils/logger'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function completeOnboarding(formData: FormData) {
  const babyId = formData.get('babyId') as string
  const nickname = (formData.get('nickname') as string || '').trim()
  const relationToBaby = (formData.get('relationToBaby') as string || '').trim()

  const supabase = await createClient()
  const contextLogger = logger.child({ function: completeOnboarding.name, babyId })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error: accessError } = await supabase
    .from('baby_access')
    .update({ nickname: nickname || null, relation_to_baby: relationToBaby })
    .eq('baby_id', babyId)
    .eq('user_id', user.id)

  if (accessError) contextLogger.error(accessError, "Error updating nickname/relation to baby")

  contextLogger.info({ nickname, relationToBaby }, "Onboarding completed")

  revalidatePath('/', 'layout')
}
