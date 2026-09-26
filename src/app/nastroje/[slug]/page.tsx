import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { TOOLS_BY_SLUG } from "@/lib/tools/registry";
import { CATEGORY_LABEL } from "@/lib/tools/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = TOOLS_BY_SLUG.get((await params).slug);
  return tool ? { title: tool.title, description: tool.description } : {};
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const tool = TOOLS_BY_SLUG.get(slug);
  if (!tool) notFound();
  if (tool.href) redirect(tool.href);
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

  return (
    <main>
      <section className="hero hero--compact">
        <div className="container">
          <nav className="crumbs small" aria-label="Drobečková navigace">
            <Link href="/">Nástroje</Link> <span aria-hidden>/</span> <span>{CATEGORY_LABEL[tool.category]}</span>
          </nav>
          <span className="eyebrow">
            Nástroj {tool.n} · {tool.flow}
          </span>
          <h1 className="h1 h1--tool">{tool.title}</h1>
          <p className="lead">{tool.description}</p>
        </div>
      </section>
      <div className="container">
        <ToolRunner tool={tool} aiEnabled={aiEnabled} />
      </div>
    </main>
  );
}
