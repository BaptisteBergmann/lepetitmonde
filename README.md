# 🍼 Baby Journal (Self-Hosted)

A private, secure, and self-hosted web application designed to share our child's major life milestones with our family and close friends (grandparents, uncles, aunts), far away from traditional social networks.

## ✨ Key Features

- **Chronological Timeline**: A news feed to post everyday photos, videos, and little anecdotes.
- **The Gazette**: An automated newsletter sent by email to keep in touch with family members who are less comfortable with technology.
- **Guessing Game Module**: An interactive game before the baby's arrival allowing loved ones to guess the birth date, name, weight, and height.
- **Progressive Web App (PWA)**: The app can be installed directly on an iOS or Android smartphone home screen (icon, full-screen mode) without having to go through the App Store.
- **Strict Access Management**: Authentication via Magic Link or email. Secure invitation system managed by the administrator with fine-grained permissions (family circles).

## 🛠️ The "Golden Stack"

The project relies on modern technologies focused on performance and security:

- **Full-Stack Framework**: [Next.js (App Router)](https://nextjs.org/) with **TypeScript**.
- **Database & Backend**: [Supabase](https://supabase.com/)
  - *PostgreSQL* for relational data.
  - *Supabase Auth* for SSR (Server-Side Rendering) authentication.
  - *Supabase Storage* for isolated media hosting (photos/videos).
  - *Realtime* for live display of new family guesses.
- **Design & UI**: Tailwind CSS, Shadcn UI, Framer Motion, and Lucide Icons.
- **Emails**: React Email paired with an SMTP relay (Resend / Brevo).
- **Logging**: [Pino](https://getpino.io/) for lightweight, structured JSON logs, perfect for production debugging.

## 🖥️ Infrastructure & Hosting

The application is built for total data sovereignty (Self-Hosted):

- Virtual home server running on **Proxmox**.
- Containerization via **Docker** / LXC.
- (Optional) Public exposure secured via Cloudflare Tunnels or a reverse proxy for safe remote access.

## 🚀 Local Deployment (Dev)

1. Clone the repository.
2. Install dependencies: `pnpm install` (or `npm install`)
3. Configure environment variables in `.env.local` (Supabase URL, API keys).
4. Start the development server: `pnpm dev`
