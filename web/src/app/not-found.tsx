import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <p className="text-lg font-semibold">Not found</p>
      <p className="mt-1 text-sm text-zinc-500">This page does not exist or is not shared with you.</p>
      <Link href="/" className="mt-4 rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white dark:bg-white dark:text-zinc-900">
        Back home
      </Link>
    </div>
  );
}
