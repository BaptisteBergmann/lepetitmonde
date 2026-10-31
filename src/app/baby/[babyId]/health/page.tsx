import { getTranslations } from "next-intl/server";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getHealthData } from "@/utils/actions/health";
import { Reveal } from "@components/reveal";
import { TzCookie } from "@components/tz_cookie";
import { GrowthView } from "./_components/growth_view";
import { OfflineNotice } from "./_components/offline_notice";
import { ProfileCard } from "./_components/profile_card";
import { VaccinesView } from "./_components/vaccines_view";
import { ViewSwitch, type HealthView } from "./_components/view_switch";
import { computeVaccineStatus } from "@/utils/vaccine-status";

export default async function HealthPage({
  params,
  searchParams,
}: {
  params: Promise<{ babyId: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { babyId } = await params;
  const { view: viewParam } = await searchParams;
  const view: HealthView = viewParam === "vaccines" ? "vaccines" : "growth";
  const t = await getTranslations("health");

  const level = await assertPageAccess(babyId, "health");
  const data = await getHealthData(babyId);
  const canWrite = level === "admin";
  const overdueCount = data.profile.birth_date
    ? computeVaccineStatus(data.profile.vaccine_schedule, data.profile.birth_date, data.today, data.vaccinations)
        .slots.filter((s) => s.status === "overdue").length
    : 0;

  return (
    <div className="text-landing-foreground">
      <TzCookie />
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-16">
        <Reveal className="border-b border-landing-border pb-4 mb-6">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-2 hidden max-w-xl text-sm text-landing-muted sm:block sm:text-base">
            {t("subtitle")}
          </p>
        </Reveal>

        <OfflineNotice />

        <div className="space-y-6">
          <ProfileCard babyId={babyId} profile={data.profile} today={data.today} canWrite={canWrite} />
          <ViewSwitch babyId={babyId} active={view} overdueCount={overdueCount} />
          {view === "growth" ? (
            <GrowthView babyId={babyId} profile={data.profile} today={data.today} measurements={data.measurements} canWrite={canWrite} />
          ) : (
            <VaccinesView babyId={babyId} profile={data.profile} today={data.today} vaccinations={data.vaccinations} canWrite={canWrite} />
          )}
        </div>
      </div>
    </div>
  );
}
