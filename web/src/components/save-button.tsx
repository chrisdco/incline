"use client";

import { useFormStatus } from "react-dom";

export function SaveProfileButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
    >
      {pending ? "Saving…" : "Save profile"}
    </button>
  );
}
