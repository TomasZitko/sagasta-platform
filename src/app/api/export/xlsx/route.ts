import { guard } from "@/lib/security/guard";
import { ReportSchema, type Report } from "@/lib/tools/report";
import { fileSlug, reportToXlsx } from "@/lib/tools/server/export";

export const runtime = "nodejs";

const TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function POST(req: Request) {
  const blocked = guard(req, { bucket: "export", perMinute: 60, maxBytes: 15 * 1024 * 1024 });
  if (blocked) return blocked;
  const parsed = ReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Neplatný report." }, { status: 400 });
  const report = parsed.data as Report;
  const buffer = await reportToXlsx(report);
  const name = `${fileSlug(report.title)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": TYPE, "Content-Disposition": `attachment; filename="${name}"` },
  });
}
