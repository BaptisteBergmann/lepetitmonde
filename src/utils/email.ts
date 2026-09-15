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

export async function sendBroadcastEmail(
  to: string,
  babyName: string,
  subject: string,
  message: string,
  photo?: { filename: string; content: Buffer },
) {
  const contextLogger = logger.child({ function: sendBroadcastEmail.name, to })
  const locale = await getLocale()

  const templatePath = path.join(process.cwd(), 'public/emails', locale, 'broadcast.html')
  const template = await readFile(templatePath, 'utf-8')
  // Both `subject` and `message` are free-form text from an admin's form,
  // so both must be escaped before going into HTML (see also
  // sendNewPostEmail below, whose `body` is a post caption for the same
  // reason).
  const escapedSubject = escapeHtml(subject)
  const escapedMessage = escapeHtml(message).replaceAll('\n', '<br>')
  const html = template
    .replaceAll('{{BABY_NAME}}', babyName)
    .replaceAll('{{SUBJECT}}', escapedSubject)
    .replaceAll('{{MESSAGE}}', escapedMessage)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    // Unlike the other templates, this subject is admin-typed rather than
    // server-generated — strip CR/LF so it can't smuggle extra headers into
    // the outgoing email.
    subject: subject.replace(/[\r\n]+/g, ' '),
    html,
    attachments: photo ? [{ filename: photo.filename, content: photo.content }] : undefined,
  })

  if (error) {
    contextLogger.error(error, "Broadcast email failed to send")
  }
}

export async function sendNewPostEmail(to: string, babyName: string, body: string, postUrl: string) {
  const contextLogger = logger.child({ function: sendNewPostEmail.name, to })
  const locale = await getLocale()
  const t = await getTranslations('email')

  const templatePath = path.join(process.cwd(), 'public/emails', locale, 'new-post.html')
  const template = await readFile(templatePath, 'utf-8')
  // `body` is either the poster's caption (free text) or a translated
  // fallback string — escape it the same way as sendBroadcastEmail's
  // message, since it can carry user-authored text.
  const escapedBody = escapeHtml(body).replaceAll('\n', '<br>')
  const html = template
    .replaceAll('{{BABY_NAME}}', babyName)
    .replaceAll('{{BODY}}', escapedBody)
    .replaceAll('{{POST_URL}}', postUrl)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: t('newPostSubject', { babyName }),
    html,
  })

  if (error) {
    contextLogger.error(error, "New post email failed to send")
  }
}
