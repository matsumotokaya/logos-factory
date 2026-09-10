import type { ImageReading } from "./structure";
import { isSuppressed } from "./facts";
import { sameName } from "@/lib/deliverable/names";
import { materialUri, MATERIAL_URI_PREFIX } from "@/lib/takes/material-uri";
import { opticalScales, type MeasuredMark } from "@/lib/materials/optical";
import type { EventPhoto } from "@/remotion/event/types";
import type { EventCmBrief } from "@/remotion/event-cm/types";

// Stage ④, second half: putting the pictures into the film.
//
// The model said what each image IS (structure.ts). Nothing here asks it where
// the picture should go, because that is not a reading problem: the film has
// three kinds of picture slot and a fixed order of preference between them, and
// a rule can be read, argued with and tested. A model choosing slots would give
// a different answer to the same material twice.
//
// Three commitments, in order of how much damage breaking them does:
//
//   1. **A face is never named by its face.** A portrait is attached to a
//      speaker only when something written down — a caption, the document, the
//      filename — gave that name. Otherwise the picture stays unused and says
//      so. Guessing here does not produce a wrong photo; it produces a wrong
//      person in a public announcement.
//   2. **Nothing a person decided is touched.** A slot they filled, or took off
//      screen, is left exactly as it is.
//   3. **A picture is never quietly dropped.** Every image the model judged
//      comes back either placed or listed as unused with the reason.

/** What the extraction stage measured about one image. */
export interface ImageMaterial {
  materialId: string;
  label: string;
  /** Mean luminance of the artwork, 0–1. Decides how a mark is drawn. */
  luminance: number | null;
  /** No transparency: the artwork arrives on a plate. */
  opaque: boolean;
  aspect: number;
  /**
   * The artwork's own extent and ink coverage (docs/asset-normalization.md §11).
   *
   * Optional because a run recorded before the measurement existed has none, and
   * a mark whose weight was never measured must keep whatever size the brief
   * already gives it rather than be reset.
   */
  inkRatio?: number | null;
  trimWidth?: number | null;
  trimHeight?: number | null;
  /**
   * The normalised copy of this file, when one was approved (§11).
   *
   * The film is placed with the copy; the model still reads the original. That
   * split is what keeps the two decisions separate — 「この画像は何か」 is
   * answered from what the user handed over, 「どのファイルを描くか」 from the
   * best form of it we have. Without this, every re-run would put the padded
   * original back and undo an approval.
   */
  normalizedId?: string | null;
  /** Whether this image reached the model at all. */
  sent: boolean;
  /** Why it did not, when it did not. */
  note?: string;
}

export interface ImagePlacement {
  /** Brief path written, e.g. `visuals.value`, `guests[0].photo`. */
  path: string;
  label: string;
  materialId: string;
  materialLabel: string;
  origin: "extracted" | "inferred";
  reason: string;
}

export interface UnusedImage {
  materialId: string;
  label: string;
  role: string;
  reason: string;
}

export interface PlaceImagesResult {
  brief: EventCmBrief;
  placed: ImagePlacement[];
  unused: UnusedImage[];
}

const SLOT_LABELS: Record<string, string> = {
  "visuals.value": "主役の写真",
  "visuals.programs": "プログラムの背景",
  "visuals.closing": "締めの背景",
  logos: "ロゴ",
};

/**
 * The focus point, in five bands.
 *
 * A head-and-shoulders portrait framed low is the case that matters: cover
 * alone puts the crop through the chin. The hand-composed brief used 0.45,
 * 0.68 and 0.5 for its three photographs, which is exactly the resolution
 * these bands carry (remotion/event/briefs/sake-2026.ts).
 */
const FOCUS_X: Record<ImageReading["focusX"], number> = {
  left: 0.32,
  centre: 0.5,
  right: 0.68,
};
const FOCUS_Y: Record<ImageReading["focusY"], number> = {
  top: 0.22,
  upper: 0.38,
  centre: 0.5,
  lower: 0.64,
  bottom: 0.78,
};

const photoOf = (reading: ImageReading, placedId: string): EventPhoto => ({
  src: materialUri(placedId),
  focus: { x: FOCUS_X[reading.focusX], y: FOCUS_Y[reading.focusY] },
});

/** Confidence high or medium. `low` never places itself; it waits to be chosen. */
const confident = (reading: ImageReading) => reading.confidence !== "low";

export function placeImagesIntoBrief(
  brief: EventCmBrief,
  readings: readonly ImageReading[],
  materials: readonly ImageMaterial[],
  source: string,
): PlaceImagesResult {
  const placed: ImagePlacement[] = [];
  const unused: UnusedImage[] = [];
  const used = new Set<string>();
  let next: EventCmBrief = { ...brief, visuals: { ...brief.visuals } };
  const provenance = { ...(brief.provenance ?? {}) };

  const byId = new Map(materials.map((material) => [material.materialId, material]));
  const materialFor = (reading: ImageReading): ImageMaterial | undefined =>
    byId.get(reading.ref) ??
    materials.find((material) => material.label === reading.ref);

  /** The file the film draws: the approved normalised copy, else the original. */
  const placedId = (reading: ImageReading): string =>
    materialFor(reading)?.normalizedId ?? reading.ref;

  const drop = (reading: ImageReading, reason: string) => {
    // One line per picture. A portrait that could not be identified is already
    // accounted for; reporting it again at the end as "no free slot" would say
    // two different reasons for one image and inflate the count.
    if (used.has(reading.ref) || unused.some((entry) => entry.materialId === reading.ref)) {
      return;
    }
    unused.push({
      materialId: reading.ref,
      label: materialFor(reading)?.label ?? reading.ref,
      role: reading.role,
      reason,
    });
  };

  const claim = (
    reading: ImageReading,
    path: string,
    label: string,
    origin: ImagePlacement["origin"],
    reason: string,
  ) => {
    used.add(reading.ref);
    // What this placement rests on: the picture, and — for a portrait — the
    // written thing that named the person, so that losing either takes the
    // placement with it (withdraw.ts). The mark row is one path holding many
    // marks, so its sources accumulate rather than replace.
    const evidence =
      reading.personEvidenceRef && reading.personEvidenceRef !== reading.ref
        ? [reading.personEvidenceRef]
        : [];
    const own = [reading.ref, ...evidence];
    const sources =
      path === "logos"
        ? [...new Set([...(provenance[path]?.sources ?? []), ...own])]
        : own;
    provenance[path] = { origin, source, note: reason, sources };
    placed.push({
      path,
      label,
      materialId: reading.ref,
      materialLabel: materialFor(reading)?.label ?? reading.ref,
      origin,
      reason,
    });
  };

  /** Whether a slot may be written: empty, not settled by a person, not off. */
  const slotFree = (path: string, occupied: boolean): string | null => {
    if (isSuppressed(brief, path)) return "この項目は画面から外されています";
    if (provenance[path]?.origin === "user") return "利用者が決めた値があります";
    // A STOCK PICTURE YIELDS TO THE USER'S OWN MATERIAL.
    //
    // `occupied` used to be enough, because the only things that filled a slot
    // were a person and a previous reading. Then the template began dressing
    // its slots from the default pool (catalog.ts `defaultVisuals`), and an
    // occupied slot stopped meaning "somebody decided this" — so a flyer's real
    // key visual lost to a generic photograph of an inkstone. That is the
    // default ladder upside down: the brand's own picture is tier 1 and the
    // pool is tier 2.
    //
    // `inferred` is exactly the mark the seed leaves (`inferred(path,
    // "テンプレートの既定画像")`), so the distinction was already recorded and
    // simply not read. Unknown provenance still blocks: a hand-written brief
    // predates provenance, and a value nobody can account for is treated as
    // somebody's decision rather than overwritten.
    if (occupied && provenance[path]?.origin !== "inferred") {
      return "すでに写真があります";
    }
    return null;
  };

  // Only what the model could actually place. `document` and `texture` are real
  // answers, not failures — a flyer scan IS the material, it is simply not a
  // picture the film shows.
  const usable = readings.filter((reading) => {
    const known = materialFor(reading);
    if (!known) {
      drop(reading, "この画像を素材と照合できませんでした");
      return false;
    }
    if (reading.role === "document" || reading.role === "texture") {
      drop(reading, "映像のスロットに使う画像ではありません");
      return false;
    }
    if (reading.role === "unreadable") {
      drop(reading, "画像を判定できませんでした");
      return false;
    }
    return true;
  });

  // 1. Portraits. Identity first, and only from written evidence.
  const guests = [...next.guests];
  let guestsChanged = false;
  for (const reading of usable) {
    if (reading.role !== "speaker-portrait") continue;
    if (!reading.personName || !reading.personEvidence) {
      drop(reading, "誰の写真か資料から確認できませんでした");
      continue;
    }
    const index = guests.findIndex((guest) => sameName(guest.name, reading.personName!));
    if (index < 0) {
      drop(reading, `「${reading.personName}」は登壇者に居ません`);
      continue;
    }
    const path = `guests[${index}].photo`;
    const blocked = slotFree(path, guests[index].photo !== null);
    if (blocked) {
      drop(reading, blocked);
      continue;
    }
    guests[index] = { ...guests[index], photo: photoOf(reading, placedId(reading)) };
    guestsChanged = true;
    claim(
      reading,
      path,
      `${guests[index].name}の写真`,
      "extracted",
      `${EVIDENCE_LABELS[reading.personEvidence]}から「${reading.personName}」と確認`,
    );
  }
  if (guestsChanged) next = { ...next, guests };

  // 2. Marks. The brand's own logo stays first; partners join the credit row.
  const knownLogoSrcs = new Set(next.logos.map((logo) => logo.src).filter(Boolean));
  const logoBlocked = slotFree("logos", false);
  for (const reading of usable) {
    if (reading.role !== "logo" || used.has(reading.ref)) continue;
    if (logoBlocked) {
      drop(reading, logoBlocked);
      continue;
    }
    if (!confident(reading)) {
      drop(reading, "ロゴかどうか確信が持てませんでした");
      continue;
    }
    const uri = materialUri(placedId(reading));
    const material = materialFor(reading);
    // What was MEASURED, not how to paint it. The painting is the theme's
    // answer (paint.ts `treatmentOn`), because a treatment written into the
    // brief is a mark painted for exactly one ground — the film could then
    // never change art direction without every mark going wrong. Recording the
    // measurement instead means the same row is correct on ink and on white.
    const measured = {
      opaque: material?.opaque ?? null,
      luminance: material?.luminance ?? null,
    };
    const transparentDark =
      measured.opaque === false &&
      measured.luminance !== null &&
      measured.luminance < 0.45;

    if (knownLogoSrcs.has(uri)) {
      // Already in the row — but a re-run has to be able to correct what is
      // recorded about it. Refusing every mark it had seen before meant a logo
      // that once landed as a white box on the ink stayed a white box no matter
      // how many times the pipeline was run. Now it also clears any treatment
      // frozen in by an older build, so the theme regains the decision.
      const at = next.logos.findIndex((logo) => logo.src === uri);
      const current = at >= 0 ? next.logos[at] : null;
      const stale =
        current !== null &&
        (current.opaque !== measured.opaque ||
          current.luminance !== measured.luminance ||
          current.treatment !== undefined);
      if (stale) {
        next = {
          ...next,
          logos: next.logos.map((logo, index) =>
            index === at
              ? { ...logo, ...measured, treatment: undefined }
              : logo,
          ),
        };
        claim(
          reading,
          "logos",
          SLOT_LABELS.logos,
          "inferred",
          transparentDark
            ? "透過した暗いマークだと測り直しました。地に応じて描き分けます"
            : "画像を測り直しました。地に応じて描き分けます",
        );
      } else {
        drop(reading, "すでにロゴとして使われています");
      }
      continue;
    }
    next = {
      ...next,
      logos: [
        ...next.logos,
        {
          name: reading.visibleText[0] ?? material?.label ?? "",
          src: uri,
          ...measured,
        },
      ],
    };
    knownLogoSrcs.add(uri);
    claim(
      reading,
      "logos",
      SLOT_LABELS.logos,
      "inferred",
      // Mirrors the wording of the self-healing branch above, and for the same
      // reason: this line is where someone reads *what was measured* about a
      // mark. It no longer names a filter, because the filter is not decided
      // here — 墨 knocks a dark transparent mark out, the standard ground draws
      // the same mark as supplied, and both are right.
      transparentDark
        ? "透過した暗いマークとして置きました。地に応じて描き分けます"
        : measured.opaque
          ? "地の付いた画像なので、そのまま描きます"
          : "透過の明るいマークとして置きました。地に応じて描き分けます",
    );
  }

  // 3. The one photograph the film is built around, then the grounds behind the
  //    programme and the closing. Order matters: the key visual gets first
  //    refusal on the best picture, and a scene ground is a supporting role.
  const scenery = usable.filter(
    (reading) =>
      !used.has(reading.ref) &&
      (reading.role === "key-visual" ||
        reading.role === "scene-photo" ||
        reading.role === "venue"),
  );
  const rank = (reading: ImageReading, wanted: ImageReading["role"]) =>
    (reading.role === wanted ? 0 : 2) + (reading.confidence === "high" ? 0 : 1);

  const fillVisual = (
    key: "value" | "programs" | "closing",
    wanted: ImageReading["role"],
  ) => {
    const path = `visuals.${key}`;
    const blocked = slotFree(path, next.visuals[key] !== null);
    if (blocked) return;
    const candidate = scenery
      .filter((reading) => !used.has(reading.ref) && confident(reading))
      .sort((a, b) => rank(a, wanted) - rank(b, wanted))[0];
    if (!candidate) return;
    next = {
      ...next,
      visuals: { ...next.visuals, [key]: photoOf(candidate, placedId(candidate)) },
    };
    claim(
      candidate,
      path,
      SLOT_LABELS[path],
      candidate.role === wanted ? "extracted" : "inferred",
      candidate.caption || candidate.reason,
    );
  };

  fillVisual("value", "key-visual");
  fillVisual("programs", "scene-photo");
  fillVisual("closing", "venue");

  for (const reading of usable) {
    if (used.has(reading.ref)) continue;
    drop(reading, "入れられる空きスロットがありませんでした");
  }

  // Every picture, accounted for — including the ones no judgement came back
  // for. A model handed eleven images and answering about ten used to leave the
  // eleventh in no list at all: not placed, not refused, simply gone. Counting
  // from the materials rather than from the answers is what closes that.
  for (const image of materials) {
    if (used.has(image.materialId)) continue;
    if (unused.some((entry) => entry.materialId === image.materialId)) continue;
    unused.push({
      materialId: image.materialId,
      label: image.label,
      role: "unjudged",
      reason: image.sent
        ? "モデルからこの画像の判定が返りませんでした"
        : (image.note ?? "モデルへ渡していません"),
    });
  }

  // Balance the credit row by ink, not by height.
  //
  // Done once here, after the row is settled, because the answer for one mark
  // depends on the others: the correction is measured against the median of the
  // row, so adding a partner's logo legitimately resizes the marks already
  // there (docs/asset-normalization.md §11, proven in the Freehand Lab).
  //
  // Only marks whose geometry was measured get a number. `scale` is a rendering
  // property with no editing surface of its own — `logos` is an `asset` field in
  // the fact list, corrected by changing the material — so there is no human
  // value here to protect; what must be protected is a mark we cannot measure,
  // which keeps whatever the brief already says.
  const measuredRow: MeasuredMark[] = [];
  for (const logo of next.logos) {
    if (!logo.src?.startsWith(MATERIAL_URI_PREFIX)) continue;
    const id = logo.src.slice(MATERIAL_URI_PREFIX.length);
    // The brief may point at a normalised copy, whose measurements ride on its
    // original's entry here (the copy was never read by the model). Balancing by
    // the copy's own numbers would be better still — it is the file being drawn —
    // but the copy is not in this list, and the two differ only by the padding
    // that ink_ratio already ignores.
    const material = materials.find(
      (entry) => entry.materialId === id || entry.normalizedId === id,
    );
    if (!material) continue;
    measuredRow.push({
      id,
      inkRatio: material.inkRatio ?? null,
      trimWidth: material.trimWidth ?? null,
      trimHeight: material.trimHeight ?? null,
    });
  }
  const scales = opticalScales(measuredRow);
  if (scales.size > 0) {
    next = {
      ...next,
      logos: next.logos.map((logo) => {
        if (!logo.src?.startsWith(MATERIAL_URI_PREFIX)) return logo;
        const scale = scales.get(logo.src.slice(MATERIAL_URI_PREFIX.length));
        return scale === undefined || logo.scale === scale ? logo : { ...logo, scale };
      }),
    };
  }

  // `factsUpdatedAt` is deliberately NOT stamped. It exists to tell the
  // narration it is describing an older event, and a photograph is not
  // something the narration says: placing one changes what the film shows, not
  // what it claims. Stamping here would mark every narration stale and rewrite
  // perfectly current words because a picture arrived.
  return { brief: { ...next, provenance }, placed, unused };
}

const EVIDENCE_LABELS: Record<NonNullable<ImageReading["personEvidence"]>, string> = {
  "image-caption": "画像のキャプション",
  "document-text": "資料の本文",
  filename: "ファイル名",
};
