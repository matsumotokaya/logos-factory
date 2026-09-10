// Video templates, projected from the one catalog.
//
// This file used to BE the catalog. It is now a view over lib/templates, which
// covers every tool kind (LP, video, banner, guideline…) with the same shape,
// because the pivot made the template — not the video — the unit the product
// grows by (docs/old/schema-v2.md §8).
//
// The exports below are unchanged so the portal and the video detail screen
// keep working; what changed is that there is no second place to edit.
//
// A template is still chosen once, at creation, and never changed afterwards:
// it decides the scene structure, the material slots, and the brief schema the
// collection pipeline has to fill. The ART DIRECTION is the other half of the
// add dialog's question, and it is not a template: the same brief can be
// painted more than one way (README 「アートディレクションは交換できる」), so a
// "style" below is a (template, painting) pair rather than a second template id.

import {
  artDirectionIds,
  templateName,
  templatesForTool,
  type TemplateEntry,
} from "@/lib/templates/catalog";
import { themeById } from "@/remotion/kit/theme";

const VIDEO_TEMPLATE_ENTRIES = templatesForTool("video");

export const VIDEO_TEMPLATE_IDS = VIDEO_TEMPLATE_ENTRIES.map(
  (template) => template.id,
) as readonly string[];

export type VideoTemplateId = string;

export interface VideoTemplate {
  id: VideoTemplateId;
  /** Short label used in the add dialog and the video list. */
  name: string;
  /** One line on what this template produces. */
  summary: string;
  /** What the template needs in order to render at all. */
  requires: string;
  /** Display length, e.g. "30秒". */
  duration: string;
  /** Whether narration is part of the template. */
  narration: boolean;
  /** Whether the brief alone is enough to play the film (catalog.ts). */
  playableFromBrief: boolean;
  /** Whether edits collect in a workbench brief and reach the film on request. */
  bakesBrief: boolean;
  /** Whether this template's brief is authored on the deliverable surface
   *  (catalog.ts). False = the detail page has nothing to draw for it. */
  authoring: boolean;
  /** Every brand gets exactly one of these by default, unpublished. */
  isBrandDefault: boolean;
  /** The kind of film, e.g. 製品紹介動画. Falls back to `name`. */
  family: string;
  /**
   * The style label when the template IS the style (product-cm's スタンダード).
   * For a template whose styles are art directions this is the family name,
   * and the per-take label comes from `styleLabel`.
   */
  variant: string;
  /** Whether the add dialog offers it. A retired template keeps its takes. */
  addable: boolean;
  /** The paintings a take of it can carry, in dialog order (theme ids). */
  artDirections: string[];
  /**
   * Whether the take chooses its painting (event-cm: yes). When false the
   * template IS the style, and `artDirections` just names the one it paints in.
   */
  choosesArtDirection: boolean;
}

const toVideoTemplate = (template: TemplateEntry): VideoTemplate => ({
  id: template.id,
  name: templateName(template),
  summary: template.summary,
  requires: template.requires,
  duration: template.duration ?? "",
  narration: template.narration ?? false,
  playableFromBrief: template.playableFromBrief ?? true,
  bakesBrief: template.bakesBrief ?? false,
  authoring: template.authoring ?? false,
  isBrandDefault: template.isBrandDefault,
  family: template.family ?? templateName(template),
  variant: template.variant ?? templateName(template),
  addable: template.addable ?? true,
  artDirections: artDirectionIds(template),
  choosesArtDirection: Boolean(template.artDirections),
});

export const VIDEO_TEMPLATES: Record<VideoTemplateId, VideoTemplate> =
  Object.fromEntries(
    VIDEO_TEMPLATE_ENTRIES.map((template) => [template.id, toVideoTemplate(template)]),
  );

export const videoTemplate = (id: string): VideoTemplate | null =>
  VIDEO_TEMPLATES[id] ?? null;

export const isVideoTemplateId = (id: string): id is VideoTemplateId =>
  Object.hasOwn(VIDEO_TEMPLATES, id);

/**
 * The style label for one take: the art direction's name when the template
 * paints in several, the template's own variant otherwise.
 *
 * `artDirection` is read from the take's brief, so an old take without one
 * resolves exactly as the renderer resolves it — to the legacy painting
 * (`themeById`), never to "unknown".
 */
export function styleLabel(templateId: string, artDirection?: string | null): string {
  const template = VIDEO_TEMPLATES[templateId];
  if (!template) return templateId;
  if (!template.choosesArtDirection) return template.variant;
  return themeById(artDirection ?? undefined).name;
}

/**
 * The full display name of one take: `イベント紹介動画 - スタンダード`,
 * `製品紹介動画 - スタンダード`. Family and style, unless they are one word.
 */
export function videoDisplayName(templateId: string, artDirection?: string | null): string {
  const template = VIDEO_TEMPLATES[templateId];
  if (!template) return templateId;
  const label = styleLabel(templateId, artDirection);
  return label === template.family ? template.family : `${template.family} - ${label}`;
}

/** Templates offered in the "add a video" dialog, in display order. */
export const ADDABLE_VIDEO_TEMPLATES: VideoTemplate[] = VIDEO_TEMPLATE_ENTRIES.map(
  toVideoTemplate,
).filter((template) => template.addable);

/**
 * One choice in the add dialog: a template, painted one way.
 *
 * `key` is what a <select> holds — one string that parses back to the pair
 * (`parseVideoStyle`), so the form state stays a single value.
 */
export interface VideoStyle {
  key: string;
  templateId: VideoTemplateId;
  /** Null for a template with one fixed painting. */
  artDirection: string | null;
  /** What the picker shows. */
  label: string;
}

const STYLE_KEY_SEPARATOR = "::";

const styleKey = (templateId: string, artDirection: string | null): string =>
  artDirection ? `${templateId}${STYLE_KEY_SEPARATOR}${artDirection}` : templateId;

/** The pair a style key stands for. Unknown keys parse to the bare template. */
export function parseVideoStyle(key: string): { templateId: string; artDirection: string | null } {
  const at = key.indexOf(STYLE_KEY_SEPARATOR);
  if (at === -1) return { templateId: key, artDirection: null };
  return {
    templateId: key.slice(0, at),
    artDirection: key.slice(at + STYLE_KEY_SEPARATOR.length) || null,
  };
}

const stylesOf = (template: VideoTemplate): VideoStyle[] =>
  template.choosesArtDirection
    ? template.artDirections.map((artDirection) => ({
        key: styleKey(template.id, artDirection),
        templateId: template.id,
        artDirection,
        label: styleLabel(template.id, artDirection),
      }))
    : [
        {
          key: styleKey(template.id, null),
          templateId: template.id,
          artDirection: null,
          label: template.variant,
        },
      ];

export interface VideoTemplateFamily {
  /** The kind of film. Also the radio label in the add dialog. */
  name: string;
  /** The styles it can be made in, in catalog order. Never empty. */
  styles: VideoStyle[];
}

/**
 * The addable templates grouped by family, in catalog order.
 *
 * The dialog asks for the kind of film first and the style second. A family
 * with one style still gets a picker: "there is one way to make this, and it
 * has a name" is information, and it is the shape the second style arrives in
 * without the screen changing.
 *
 * Order comes from `TEMPLATES` and nowhere else — a second list of families
 * here would be a second place to edit, which is the thing lib/templates was
 * introduced to remove.
 */
export const VIDEO_TEMPLATE_FAMILIES: VideoTemplateFamily[] =
  ADDABLE_VIDEO_TEMPLATES.reduce<VideoTemplateFamily[]>((families, template) => {
    const styles = stylesOf(template);
    const found = families.find((family) => family.name === template.family);
    if (found) found.styles.push(...styles);
    else families.push({ name: template.family, styles });
    return families;
  }, []);

/** What the add dialog starts on: the first style of the first family. */
export const DEFAULT_ADDABLE_VIDEO_STYLE: VideoStyle = VIDEO_TEMPLATE_FAMILIES[0].styles[0];

/**
 * Where a template's family sits in the catalog order, for grouping the list.
 *
 * Every template, not just the addable ones: a retired template's takes are
 * still real videos and still belong with their family on the page. Unknown
 * ids sort last rather than first — a take pinned to a template that has left
 * the catalog entirely should not lead the page.
 */
export const videoFamilyIndex = (id: string): number => {
  const template = VIDEO_TEMPLATES[id];
  if (!template) return VIDEO_TEMPLATE_FAMILIES.length + 1;
  const index = VIDEO_TEMPLATE_FAMILIES.findIndex((family) => family.name === template.family);
  return index === -1 ? VIDEO_TEMPLATE_FAMILIES.length : index;
};
