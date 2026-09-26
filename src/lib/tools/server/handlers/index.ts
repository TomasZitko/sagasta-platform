import "server-only";
import type { ToolHandler } from "../context";
import { boq, consistency, missingInfo, revisions, structure } from "./checks";
import { technicalReport, techProcedure, zov } from "./generators";
import { bids, comments, correspondence, emailTask, meeting } from "./office";
import { extractProject, pdfToExcel } from "./project";

export const HANDLERS: Record<string, ToolHandler> = {
  "extrakce-dat": extractProject,
  "technicka-zprava": technicalReport,
  zov,
  "technologicky-postup": techProcedure,
  "kontrola-konzistence": consistency,
  "chybejici-informace": missingInfo,
  "kontrola-struktury": structure,
  "porovnani-revizi": revisions,
  pripominky: comments,
  "zapis-z-jednani": meeting,
  "email-ukol": emailTask,
  korespondence: correspondence,
  "porovnani-nabidek": bids,
  "kontrola-vykazu": boq,
  "pdf-excel": pdfToExcel,
};
