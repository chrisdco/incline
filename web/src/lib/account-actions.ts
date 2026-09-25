"use server";

import { revalidatePath } from "next/cache";

import { supabaseForUser } from "./supabase";

export interface DeletionStatus {
  requested_at: string;
  purge_at: string;
}

export async function getDeletionStatusAction(): Promise<DeletionStatus | null> {
  const { supabase, userId } = await supabaseForUser();
  const { data } = await supabase.from("account_deletions").select("requested_at,purge_at").eq("user_id", userId).maybeSingle();
  return (data as DeletionStatus | null) ?? null;
}

/** Schedule deletion: one self-serve insert, window enforced by DB CHECK. */
export async function requestDeletionAction(): Promise<DeletionStatus> {
  const { supabase, userId } = await supabaseForUser();
  const { data, error } = await supabase
    .from("account_deletions")
    .insert({ user_id: userId })
    .select("requested_at,purge_at")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  return data as DeletionStatus;
}

/** Cancel: delete the flag. Cloud rows were never tombstoned, so next sync restores. */
export async function cancelDeletionAction(): Promise<void> {
  const { supabase, userId } = await supabaseForUser();
  const { error } = await supabase.from("account_deletions").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
