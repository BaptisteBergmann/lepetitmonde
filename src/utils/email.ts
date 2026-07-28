import { Resend } from 'resend'
import { readFile } from 'fs/promises'
import path from 'path'
import { logger } from '@/utils/logger'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!

export async function sendWelcomeEmail(to: string, firstName: string) {
  const contextLogger = logger.child({ function: sendWelcomeEmail.name, to })

  const templatePath = path.join(process.cwd(), 'public/emails/welcome.html')
  const template = await readFile(templatePath, 'utf-8')
  const html = template
    .replaceAll('{{FIRST_NAME}}', firstName)
    .replaceAll('{{SITE_URL}}', siteUrl)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: 'Bienvenue sur Le petit monde',
    html,
  })

  if (error) {
    contextLogger.error(error, "Welcome email failed to send")
  }
}

export async function sendInviteEmail(to: string, babyName: string, inviteUrl: string) {
  const contextLogger = logger.child({ function: sendInviteEmail.name, to })

  const templatePath = path.join(process.cwd(), 'public/emails/invite-member.html')
  const template = await readFile(templatePath, 'utf-8')
  const html = template
    .replaceAll('{{BABY_NAME}}', babyName)
    .replaceAll('{{INVITE_URL}}', inviteUrl)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: `Invitation à rejoindre le journal de ${babyName}`,
    html,
  })

  if (error) {
    contextLogger.error(error, "Invite email failed to send")
  }
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderGazettePostBlock(post: { photoUrl: string | null; caption: string | null; takenAt: string }) {
  const dateLabel = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(post.takenAt))
  const image = post.photoUrl
    ? `<img src="${siteUrl}${post.photoUrl}" width="416" style="width:100%; max-width:416px; border-radius:12px; display:block; margin:0 0 10px 0;" alt="" />`
    : ''
  const caption = post.caption
    ? `<p style="margin:0; color:#2b3542; font-size:14px; line-height:1.5;">${escapeHtml(post.caption)}</p>`
    : ''

  return `
    <div style="padding:16px 0; border-bottom:1px solid rgba(43,53,66,0.08);">
      <p style="margin:0 0 8px 0; color:#6e6459; font-size:12px; text-transform:uppercase; letter-spacing:0.04em;">${dateLabel}</p>
      ${image}
      ${caption}
    </div>
  `
}

export async function sendGazetteDigestEmail(
  to: string,
  babyName: string,
  periodLabel: string,
  posts: { photoUrl: string | null; caption: string | null; takenAt: string }[]
) {
  const contextLogger = logger.child({ function: sendGazetteDigestEmail.name, to })

  const templatePath = path.join(process.cwd(), 'public/emails/gazette-digest.html')
  const template = await readFile(templatePath, 'utf-8')
  const html = template
    .replaceAll('{{BABY_NAME}}', escapeHtml(babyName))
    .replaceAll('{{PERIOD_LABEL}}', escapeHtml(periodLabel))
    .replaceAll('{{POSTS_HTML}}', posts.map(renderGazettePostBlock).join(''))
    .replaceAll('{{SITE_URL}}', siteUrl)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: `La Gazette de ${babyName}`,
    html,
  })

  if (error) {
    contextLogger.error(error, "Gazette digest email failed to send")
  }
}
