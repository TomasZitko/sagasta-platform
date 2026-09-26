import type { Report } from "@/lib/tools/report";
import { fileSlug, reportToXlsx } from "@/lib/tools/server/export";

export const runtime = "nodejs";

const TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function POST(req: Request) {
  const report = (await req.json().catch(() => null)) as Report | null;
  if (!report?.title || !Array.isArray(report.sections)) return Response.json({ error: "Chybí report." }, { status: 400 });
  const buffer = await reportToXlsx(report);
  const name = `${fileSlug(report.title)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": TYPE, "Content-Disposition": `attachment; filename="${name}"` },
  });
}
