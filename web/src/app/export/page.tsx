import ExportClient from "@/components/export-client";

export const dynamic = "force-dynamic";

export default function ExportPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Export</h1>
        <p className="text-sm text-zinc-500">Your data, out. Runs entirely in your browser.</p>
      </div>
      <ExportClient />
    </div>
  );
}
