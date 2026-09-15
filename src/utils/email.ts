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

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export async function sendFairePartEmail(
  to: string,
  babyName: string,
  message: string,
  photo?: { filename: string; content: Buffer },
) {
  const contextLogger = logger.child({ function: sendFairePartEmail.name, to })
  const locale = await getLocale()
  const t = await getTranslations('email')

  const templatePath = path.join(process.cwd(), 'public/emails', locale, 'faire-part.html')
  const template = await readFile(templatePath, 'utf-8')
  // `message` is free-form text from an admin's textarea — the only email
  // template that interpolates user-authored content rather than
  // server-generated strings, so it must be escaped before going into HTML.
  const escapedMessage = escapeHtml(message).replaceAll('\n', '<br>')
  const html = template
    .replaceAll('{{BABY_NAME}}', babyName)
    .replaceAll('{{MESSAGE}}', escapedMessage)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: t('fairePartSubject', { babyName }),
    html,
    attachments: photo ? [{ filename: photo.filename, content: photo.content }] : undefined,
  })

  if (error) {
    contextLogger.error(error, "Faire-part email failed to send")
  }
}
