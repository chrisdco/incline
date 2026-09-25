"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Card, SectionTitle } from "@/components/ui";
import { cancelDeletionAction, requestDeletionAction, type DeletionStatus } from "@/lib/account-actions";

export default function DangerZone({ status, enabled }: { status: DeletionStatus | null; enabled: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  async function request() {
    setBusy(true);
    setError(null);
    try {
      await requestDeletionAction();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not schedule deletion");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await cancelDeletionAction();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel deletion");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionTitle>Danger zone</SectionTitle>
      {error ? <p role="alert" className="mb-2 text-sm text-red-600">{error}</p> : null}
      {status ? (
        <div className="rounded-xl bg-amber-50 p-4 dark:bg-amber-950/40">
          <p className="text-sm font-semibold">Deletion scheduled</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Everything is wiped on {new Date(status.purge_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.
            Signing back into the mobile app restores it all automatically until then.
          </p>
          <button
            onClick={() => void cancel()}
            disabled={busy}
            className="mt-3 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {busy ? "Working…" : "Undo deletion"}
          </button>
        </div>
      ) : confirming ? (
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            This schedules deletion of <strong>all</strong> your workouts, measurements, routines and photos in 30 days.
            Wipe happens automatically — re-login before then cancels it and restores everything.
          </p>
          <p className="mt-2 text-sm">
            <Link href="/export" className="font-medium text-teal-700 underline dark:text-teal-300">Export your data first</Link> — deleted data cannot be recovered after the purge.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="h-4 w-4" />
            I understand this cannot be undone after the purge date
          </label>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => void request()}
              disabled={busy || !understood}
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Working…" : "Schedule deletion"}
            </button>
            <button onClick={() => setConfirming(false)} className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-semibold dark:border-zinc-700">
              Keep my account
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">Delete your account and all training data, with a 30-day undo window.</p>
          <button
            onClick={() => setConfirming(true)}
            className="shrink-0 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 dark:border-red-900 dark:text-red-400"
          >
            Delete account…
          </button>
        </div>
      )}
    </Card>
  );
}
