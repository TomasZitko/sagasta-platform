import { catalogueToDocx } from "@/lib/hazards/docx";
import type { Catalogue } from "@/lib/hazards/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const catalogue = (await req.json().catch(() => null)) as Catalogue | null;
  if (!catalogue?.entries || !catalogue.project) {
    return Response.json({ error: "Chybí katalog." }, { status: 400 });
  }
  const buffer = await catalogueToDocx(catalogue);
  const slug = catalogue.project.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .slice(0, 60)
    .replace(/^_|_$/g, "");
  const filename = `KatalogNebezpeci_${slug || "stavba"}_${new Date().toISOString().slice(0, 10)}.docx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
