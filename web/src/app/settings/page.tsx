import { getPrefs, getProfile, updateProfileAction } from "@/lib/queries";
import { getDeletionStatusAction } from "@/lib/account-actions";
import { setAutonomyAction } from "@/lib/progression-actions";
import { AUTONOMY_COPY, PROGRESSION_AUTONOMY, isProgressionAutonomy } from "../../../../src/contracts/coaching/progression";
import DangerZone from "@/components/danger-zone";
import { SaveProfileButton } from "@/components/save-button";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const GOALS = ["build_muscle", "gain_strength", "lose_fat", "improve_endurance"];

export default async function SettingsPage() {
  // Shipped dark until real users: no status query, no danger zone, no extra
  // network. Flip ACCOUNT_DELETION_ENABLED to expose the whole flow.
  const deletionEnabled = process.env.ACCOUNT_DELETION_ENABLED === "true";
  const [profile, prefs, deletion] = await Promise.all([
    getProfile(),
    getPrefs(),
    deletionEnabled ? getDeletionStatusAction() : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Settings</h1>

      <Card>
        <SectionTitle>Profile</SectionTitle>
        {!profile ? (
          <p className="text-sm text-zinc-500">No profile yet — finish onboarding in the mobile app first.</p>
        ) : (
          <form action={updateProfileAction} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-500">Name</span>
              <input
                name="name"
                autoComplete="name"
                spellCheck={false}
                defaultValue={profile.name}
                required
                className="rounded-xl border border-zinc-300 bg-white px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-500">Goal</span>
                <select
                  name="goal"
                  defaultValue={profile.goal}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {GOALS.map((g) => (
                    <option key={g} value={g}>{g.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-500">Units</span>
                <select
                  name="unit"
                  defaultValue={profile.unit}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="metric">Metric (kg)</option>
                  <option value="imperial">Imperial (lb)</option>
                </select>
              </label>
            </div>
            <SaveProfileButton />
          </form>
        )}
      </Card>

      <Card>
        <SectionTitle>Coaching</SectionTitle>
        <form action={setAutonomyAction} className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Plateau fixes</legend>
            {PROGRESSION_AUTONOMY.map((m) => (
              <label key={m} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="autonomy"
                  value={m}
                  defaultChecked={(isProgressionAutonomy(prefs.progressionAutonomy) ? prefs.progressionAutonomy : "ask") === m}
                  className="mt-1 accent-teal-600"
                />
                <span>
                  <span className="font-medium">{AUTONOMY_COPY[m].label}</span>
                  <span className="block text-zinc-500">{AUTONOMY_COPY[m].detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button className="self-start rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600">
            Save
          </button>
          <p className="text-xs text-zinc-500">Syncs to your phone. Suggestions from Claude or Ask always wait for you.</p>
        </form>
      </Card>

      <Card>
        <SectionTitle>Synced preferences (read-only)</SectionTitle>
        <p className="mb-2 text-sm text-zinc-500">Account-level prefs sync from mobile. Device settings stay on-device.</p>
        <pre className="overflow-x-auto rounded-xl bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
          {JSON.stringify(prefs, null, 2)}
        </pre>
      </Card>

      <DangerZone status={deletionEnabled ? deletion : null} enabled={deletionEnabled} />
    </div>
  );
}
