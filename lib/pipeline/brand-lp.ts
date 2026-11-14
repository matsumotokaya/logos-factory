/**
 * The five-stage pipeline for one LP (`brand-lp`), plus the kit it was drawn
 * from as the stage before the first.
 *
 * The same five stages every deliverable has (stages.ts), read off the LP's
 * brief: an LP is made in one go, so every stage it has is `ready`, and all of
 * them go `stale` together when the kit moves on — the kit is the input, and
 * a changed input invalidates everything after it. Nothing here is stored.
 *
 * What each stage means for an LP:
 *
 *   入力       the kit as it was read, and the site's screen
 *   抽出       the features and customers' words read from the brand
 *   構造化     the five sections, and where each one's facts came from
 *   マッピング  the kit's colour, type and shape fitted to the page
 *   出力       the HTML
 *
 * Pure, so it can be tested and drawn on either side.
 */

import { parseFeatures, parseVoices } from "@/lib/brand/content";
import type { BrandLpBrief } from "@/lib/templates/brand-lp/brief-schema";
import { LP_SECTIONS } from "@/lib/templates/brand-lp/brief-schema";
import { STAGE_LABELS, type PipelineStage, type PipelineStageId, type PipelineStageStatus } from "./stages";

/** The stage before the first: what the deliverable was made from. */
export interface PipelineUpstream {
  label: string;
  summary: string;
  /** `stale` when it has changed since the deliverable was made. */
  status: PipelineStageStatus;
}

export interface LpPipeline {
  upstream: PipelineUpstream;
  stages: PipelineStage[];
}

/** Features and voices the extract stage found, for LPs made before `read` was recorded. */
export function lpRead(brief: BrandLpBrief): { features: number; voices: number } {
  if (brief.read) return { features: brief.read.features.length, voices: brief.read.voices.length };
  return {
    features: parseFeatures(brief.kit.values["offering.features"])?.length ?? (brief.basis.features.origin === "sample" ? 0 : 3),
    voices: parseVoices(brief.kit.values["proof.voices"])?.length ?? (brief.basis.voices.origin === "sample" ? 0 : brief.content.voices.items.length),
  };
}

const stamp = (iso: string) => {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export function lpPipeline(input: {
  brief: BrandLpBrief;
  createdAt: string;
  /** The brand's kit differs from the one frozen in the brief. */
  kitChanged: boolean;
  /** Kit values the page had to correct (design.ts notes). */
  designNotes: number;
}): LpPipeline {
  const { brief, createdAt, kitChanged } = input;
  const status: PipelineStageStatus = kitChanged ? "stale" : "ready";
  const read = lpRead(brief);
  const workspace = LP_SECTIONS.filter((section) => brief.basis[section].origin === "workspace").length;
  const sample = LP_SECTIONS.filter((section) => brief.basis[section].origin === "sample").length;
  const values = Object.keys(brief.kit.values).length;

  const summary: Record<PipelineStageId, string> = {
    input: `キット ${values}項目${brief.kit.logos.length > 0 ? "・ロゴ" : ""}${brief.visuals.screen ? "・画面" : ""}`,
    extract: `特長 ${read.features}件・声 ${read.voices}件`,
    structure:
      workspace + sample === 0
        ? `${LP_SECTIONS.length}節すべてキットから`
        : [workspace > 0 ? `推定 ${workspace}節` : "", sample > 0 ? `仮 ${sample}節` : ""].filter(Boolean).join("・"),
    map: input.designNotes > 0 ? `補ったこと ${input.designNotes}件` : "キットのまま",
    output: `HTML 1ページ・${stamp(createdAt)}`,
  };

  return {
    upstream: {
      label: "キット",
      summary: kitChanged ? `${stamp(brief.kit.snapshotAt)} の読み取り・更新あり` : `${stamp(brief.kit.snapshotAt)} の読み取り`,
      status,
    },
    stages: (Object.keys(summary) as PipelineStageId[]).map((id) => ({
      id,
      label: STAGE_LABELS[id],
      status,
      summary: summary[id],
      producedAt: createdAt,
    })),
  };
}
