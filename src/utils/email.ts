import { Resend } from 'resend'
import { readFile } from 'fs/promises'
import path from 'path'
import { getLocale, getTranslations } from 'next-intl/server'
import { logger } from '@/utils/logger'

const siteUrl = process.env.SITE_URL!

export async function sendWelcomeEmail(to: string, firstName: string) {
  const contextLogger = logger.child({ function: sendWelcomeEmail.name, to })
  const locale = await getLocale()
  const t = await getTranslations('email')

  const templatePath = path.join(process.cwd(), 'public/emails', locale, 'welcome.html')
  const template = await readFile(templatePath, 'utf-8')
  const html = template
    .replaceAll('{{FIRST_NAME}}', firstName)
    .replaceAll('{{SITE_URL}}', siteUrl)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: t('welcomeSubject'),
    html,
  })

  if (error) {
    contextLogger.error(error, "Welcome email failed to send")
  }
}

export async function sendInviteEmail(to: string, babyName: string, inviteUrl: string) {
  const contextLogger = logger.child({ function: sendInviteEmail.name, to })
  const locale = await getLocale()
  const t = await getTranslations('email')

  const templatePath = path.join(process.cwd(), 'public/emails', locale, 'invite-member.html')
  const template = await readFile(templatePath, 'utf-8')
  const html = template
    .replaceAll('{{BABY_NAME}}', babyName)
    .replaceAll('{{INVITE_URL}}', inviteUrl)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: t('inviteSubject', { babyName }),
    html,
  })

  if (error) {
    contextLogger.error(error, "Invite email failed to send")
  }
}
