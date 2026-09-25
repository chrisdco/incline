import { getProfile } from "@/lib/queries";
import ImportClient from "@/components/import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const profile = await getProfile();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Import history</h1>
        <p className="text-sm text-zinc-500">Bring past workouts from Hevy or Strong. Always dry-run first.</p>
      </div>
      <ImportClient defaultUnit={profile?.unit === "imperial" ? "lb" : "kg"} />
    </div>
  );
}
