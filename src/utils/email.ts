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
    from: 'Le petit monde <lepetitmonde@baptistebergmann.com>',
    to,
    subject: 'Bienvenue sur Le petit monde',
    html,
  })

  if (error) {
    contextLogger.error(error, "Welcome email failed to send")
  }
}
