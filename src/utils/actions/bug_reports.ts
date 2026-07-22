'use server'

import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { getAuthUser } from '@utils/supabase/auth'
import { logger } from '../logger'
import { ensureBugReportsBucket } from './storage'

export async function submitBugReport(formData: FormData) {
  const contextLogger = logger.child({ function: submitBugReport.name })

  const { data: { user } } = await getAuthUser()
  if (!user) throw new Error("Non authentifié")

  const description = (formData.get('description') as string | null)?.trim()
  if (!description) throw new Error("Merci de décrire le problème.")

  const pageUrl = (formData.get('pageUrl') as string | null) || null
  const userAgent = (formData.get('userAgent') as string | null) || null
  const screenshot = formData.get('screenshot') as File | null

  const supabase = await createClient()

  let screenshotPath: string | null = null

  if (screenshot && screenshot.size > 0) {
    const bucket = await ensureBugReportsBucket()
    const path = `${user.id}/${Date.now()}.png`
    const supabaseAdmin = createAdminClient()
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(path, screenshot, { contentType: 'image/png' })

    if (uploadError) {
      contextLogger.error(uploadError, "Error uploading bug report screenshot")
    } else {
      screenshotPath = path
    }
  }

  const { error } = await supabase.from('bug_reports').insert({
    description,
    page_url: pageUrl,
    user_agent: userAgent,
    screenshot_path: screenshotPath,
  })

  if (error) {
    contextLogger.error(error, "Error saving bug report")
    throw error
  }

  contextLogger.info({ userId: user.id, hasScreenshot: Boolean(screenshotPath) }, "Bug report submitted")
}
