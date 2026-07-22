import { sendInvite, getInvitations } from "@utils/actions/invite";
import CreateCircle from "./_components/create_circle";
import RealtimeCirclesList from "./_components/display_circles";
import { getCircles, getAllCirclesAccess } from "@utils/actions/circles";
import CreateInvite from "./_components/create_invite";
import RealtimeUsersList from "./_components/display_users";
import InvitationsList from "./_components/display_invitations";
import { getUsers, getUserAccess } from "@/utils/actions/users";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@components/reveal";

export default async function InviteForm({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params;
  const access = await getUserAccess(babyId);
  const isAdmin = !Array.isArray(access) && access?.access_level === "admin";
  const users = await getUsers(babyId);

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        {/* Header Section */}
        <Reveal className="border-b border-landing-border pb-6">
          <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
            Page — Le cercle
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold">
            Cercles & accès
          </h1>
          <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">
            Gérez la famille et les proches qui partagent la vie de votre bébé. Organisez les accès par cercles.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left Column: Forms and Invites (5 cols) */}
          <div className="space-y-6 lg:col-span-5">
            {isAdmin && (
              <>
                {/* Form: Invite by Email */}
                <Card className="border-landing-border bg-landing-surface">
                  <CardHeader className="pb-3">
                    <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
                      <UserPlus className="h-4.5 w-4.5 text-primary" />
                      Inviter par e-mail
                    </CardTitle>
                    <CardDescription className="text-xs text-landing-muted">
                      Envoyez un e-mail d&apos;invitation pour rejoindre ce journal.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form action={sendInvite} className="space-y-3.5">
                      <input type="hidden" name="babyId" value={babyId} />
                      <div className="flex flex-col gap-1.5">
                        <Input
                          name="email"
                          type="email"
                          placeholder="email@famille.com"
                          required
                          className="w-full bg-input/40"
                        />
                      </div>
                      <Button type="submit" className="w-full rounded-2xl cursor-pointer gap-2">
                        <Mail className="h-4 w-4" />
                        <span>Envoyer l&apos;invitation</span>
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* Card: Shareable Link */}
                <CreateInvite babyId={babyId} />

                {/* Form: Create Circle */}
                <CreateCircle babyId={babyId} />
              </>
            )}
          </div>

          {/* Right Column: Lists of Members and Circles (7 cols) */}
          <div className="space-y-6 lg:col-span-7">
            {/* Members List Card */}
            <Card className="border-landing-border bg-landing-surface">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
                  <Users className="h-4.5 w-4.5 text-primary" />
                  Membres du journal
                </CardTitle>
                <CardDescription className="text-xs text-landing-muted">
                  Liste des personnes ayant accès à ce journal de bébé.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <RealtimeUsersList babyId={babyId} initialUsers={users} isAdmin={isAdmin} />
              </CardContent>
            </Card>

            {/* Circles List Card */}
            <Card className="border-landing-border bg-landing-surface">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
                  <Users className="h-4.5 w-4.5 text-rose" />
                  Cercles de partage
                </CardTitle>
                <CardDescription className="text-xs text-landing-muted">
                  Groupes organisés pour structurer les droits d&apos;accès.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <RealtimeCirclesList
                  babyId={babyId}
                  initialCircles={await getCircles(babyId)}
                  initialCirclesAccess={await getAllCirclesAccess(babyId)}
                  users={users}
                  isAdmin={isAdmin}
                />
              </CardContent>
            </Card>

            {/* Invitations List Card (admin only) */}
            {isAdmin && (
              <Card className="border-landing-border bg-landing-surface">
                <CardHeader className="pb-3">
                  <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
                    <ShieldCheck className="h-4.5 w-4.5 text-primary" />
                    Liens d&apos;invitation
                  </CardTitle>
                  <CardDescription className="text-xs text-landing-muted">
                    Historique des liens générés, actifs et expirés.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-2">
                  <InvitationsList invitations={await getInvitations(babyId)} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
