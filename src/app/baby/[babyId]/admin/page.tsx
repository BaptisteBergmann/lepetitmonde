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
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header Section */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-primary/80 to-rose bg-clip-text text-transparent flex items-center gap-2">
          👥 Cercles & Accès
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-xl">
          Gérez la famille et les proches qui partagent la vie de votre bébé. Organisez les accès par cercles.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Forms and Invites (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {isAdmin && (
            <>
              {/* Form: Invite by Email */}
              <Card className="border border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <UserPlus className="h-4.5 w-4.5 text-primary" />
                    Inviter par e-mail
                  </CardTitle>
                  <CardDescription className="text-xs">
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
        <div className="lg:col-span-7 space-y-6">
          {/* Members List Card */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="h-4.5 w-4.5 text-primary" />
                Membres du Journal
              </CardTitle>
              <CardDescription className="text-xs">
                Liste des personnes ayant accès à ce journal de bébé.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <RealtimeUsersList babyId={babyId} initialUsers={users} isAdmin={isAdmin} />
            </CardContent>
          </Card>

          {/* Circles List Card */}
          <Card className="border border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Users className="h-4.5 w-4.5 text-rose" />
                Cercles de partage
              </CardTitle>
              <CardDescription className="text-xs">
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
            <Card className="border border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ShieldCheck className="h-4.5 w-4.5 text-primary" />
                  Liens d&apos;invitation
                </CardTitle>
                <CardDescription className="text-xs">
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
  );
}
