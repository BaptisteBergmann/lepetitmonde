'use server'

import { revalidatePath } from 'next/cache'
import webpush, { ensureVapidConfigured } from '@utils/webpush'
import { createClient } from '@utils/supabase/server'
import { createAdminClient } from '@utils/supabase/admin'
import { getAuthUser } from '@utils/supabase/auth'
import { Enums } from '@utils/supabase/database.types'
import { logger } from '../logger'
import { ensureBugReportsBucket } from './storage'
import { assertIsAdmin } from './access'

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

// Bug reports aren't tied to a baby, but every admin page is reached through
// a baby route, so we piggyback on that baby's admin check as the gate.
export async function getBugReports(babyId: string) {
  const contextLogger = logger.child({ function: getBugReports.name, babyId })

  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const { data, error } = await supabase
    .from('bug_reports')
    .select(`*, users (first_name, last_name, nickname)`)
    .order('created_at', { ascending: false })

  if (error) {
    contextLogger.error(error, "Error fetching bug reports")
    throw error
  }

  return data
}

// Marking a report "fixed" also pushes the reporter a heads-up. Marking it
// merely "reviewed" (still investigating) does not — that status exists so
// admins can tell apart "seen" from "untouched" without spamming the reporter.
export async function updateBugReportStatus(babyId: string, bugReportId: string, status: Enums<'bug_report_status'>) {
  const contextLogger = logger.child({ function: updateBugReportStatus.name, babyId, bugReportId, status })

  const supabase = await createClient()
  await assertIsAdmin(supabase, babyId)

  const { data: report, error } = await supabase
    .from('bug_reports')
    .update({ status })
    .eq('id', bugReportId)
    .select('created_by')
    .single()

  if (error) {
    contextLogger.error(error, "Error updating bug report status")
    throw error
  }

  contextLogger.info("Bug report status updated")

  if (status === 'fixed' && report.created_by) {
    await notifyBugReportFixed(report.created_by)
  }

  revalidatePath(`/baby/${babyId}/admin`)
}

// Best-effort, like the rest of the push pipeline: a reporter with no
// registered device (or a delivery failure) must not block the status update.
async function notifyBugReportFixed(userId: string) {
  const contextLogger = logger.child({ function: notifyBugReportFixed.name, userId })

  try {
    const supabase = await createClient()
    const { data: devices } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', userId)

    if (!devices || devices.length === 0) return

    const payload = JSON.stringify({
      title: 'Le petit monde',
      body: 'Le bug que vous avez signalé a été corrigé. Merci pour votre signalement !',
      icon: '/favicon-96x96.png',
    })

    ensureVapidConfigured()
    const results = await Promise.allSettled(
      devices.map((device) => webpush.sendNotification(device.subscription as webpush.PushSubscription, payload))
    )

    const failures = results.filter((r) => r.status === 'rejected')
    if (failures.length > 0) {
      contextLogger.error({ failures: failures.length, total: devices.length }, "Some devices failed to receive the bug-fixed push")
    }
  } catch (err) {
    contextLogger.error(err, "Error sending bug-fixed notification")
  }
}
