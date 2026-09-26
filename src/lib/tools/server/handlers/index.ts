import "server-only";
import type { ToolHandler } from "../context";
import { boq, consistency, missingInfo, revisions, structure } from "./checks";
import { converter, handover, meetingTasks, naming, permits, photoIssues, punchList, search, siteReport, techSpec } from "./extra";
import { technicalReport, techProcedure, zov } from "./generators";
import { bids, comments, correspondence, emailTask, meeting } from "./office";
import { extractProject, pdfToExcel } from "./project";

/** Varianta nástroje se sdíleným motorem a pevným režimem. */
const withMode =
  (slug: string, handler: ToolHandler, mode: string): ToolHandler =>
  async (ctx) => {
    ctx.values.mode = mode;
    const report = await handler(ctx);
    report.tool = slug;
    return report;
  };

export const HANDLERS: Record<string, ToolHandler> = {
  "extrakce-dat": extractProject,
  "technicka-zprava": technicalReport,
  zov,
  "technologicky-postup": withMode("technologicky-postup", techProcedure, "tech"),
  "postup-bourani": withMode("postup-bourani", techProcedure, "demolition"),
  "kontrola-konzistence": consistency,
  "chybejici-informace": missingInfo,
  "kontrola-struktury": structure,
  "porovnani-revizi": revisions,
  pripominky: comments,
  "zapis-z-jednani": meeting,
  "ukoly-z-jednani": meetingTasks,
  "email-ukol": emailTask,
  korespondence: withMode("korespondence", correspondence, "reply"),
  rfi: withMode("rfi", correspondence, "rfi"),
  "odpoved-uradu": withMode("odpoved-uradu", correspondence, "authority"),
  "porovnani-nabidek": bids,
  "kontrola-vykazu": boq,
  "pdf-excel": pdfToExcel,
  "stary-novy-projekt": converter,
  vyhledavani: search,
  "kontrolni-den": siteReport,
  "foto-problemy": photoIssues,
  "soupis-vad": punchList,
  "predavaci-dokumentace": handover,
  "technicka-specifikace": techSpec,
  "dotcene-organy": permits,
  "pojmenovani-souboru": naming,
};
