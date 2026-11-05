// What one row of the brand tree offers, and the sentence that says why it cannot.
//
// The kebab menu asks the same two questions of five different kinds of node —
// may this be duplicated, may this be deleted — and when the answer is no, the
// menu has to say why in the menu itself. A greyed-out item with no reason is
// worse than no item at all: it tells the user they are not allowed without
// telling them what to do about it.
//
// The blocking rules are not invented here. Postgres already refuses to delete
// a container that still holds something (`on delete restrict` on
// brand_entities.organization_id, takes.brand_id,
// brand_materials.brand_id) and `delete_take` (migration 0031) refuses while a
// publication is live. This module restates those same rules in Japanese so the
// menu can say them *before* the request, and the server can say them again
// after — the two must agree, which is why this file has no DOM and a test.
//
// Containers are never emptied from above. Deleting an Organization does not
// take its brands with it, and deleting a Brand does not take its videos: a
// menu item two clicks deep must not be able to destroy a tree. Leaves take
// their own subordinates (a take's renders and artifacts, a logo's candidates
// and presentation), which is what the cascades already do.

export type TreeNodeKind = "brand" | "logo" | "video";

export type TreeActionId = "info" | "add-child" | "set-parent" | "duplicate" | "delete";

export interface TreeAction {
  id: TreeActionId;
  label: string;
  /** null = available. A string is shown under the label, in the menu. */
  blockedReason: string | null;
  danger: boolean;
}

/** What the sidebar knows about an Organization without asking the server. */
export interface BrandActionFacts {
  logoCount: number;
  videoCount: number;
  lpCount: number;
}

export interface TakeActionFacts {
  /** A live canonical publication. `delete_take` refuses while one exists. */
  published: boolean;
}

const deleteAction = (label: string, blockedReason: string | null): TreeAction => ({
  id: "delete",
  label,
  blockedReason,
  danger: true,
});

// Every leaf has two faces: the thing itself (the presentation, the player,
// the LP preview) is what the row opens, and a text page of secondary facts
// about it (format, size, length, public URL) sits behind this item. The menu
// is that page's only entrance — the facts are not worth a button on the face.
const infoAction = (): TreeAction => ({
  id: "info",
  label: "詳細",
  blockedReason: null,
  danger: false,
});

const duplicateAction = (blockedReason: string | null = null): TreeAction => ({
  id: "duplicate",
  label: "複製する",
  blockedReason,
  danger: false,
});

export function brandActions(facts: BrandActionFacts): TreeAction[] {
  // Same reasoning as Organizations: a Brand's value is its knowledge, logos
  // and takes, and a copy that carries none of them is not a copy.
  const parts: string[] = [];
  if (facts.logoCount > 0) parts.push(`ロゴ${facts.logoCount}件`);
  const assetCount = facts.videoCount + facts.lpCount;
  if (assetCount > 0) parts.push(`動画・LP${assetCount}件`);
  return [
    // A sub-brand goes under this one: a subsidiary, a product line. Same
    // shape one level down (docs/product.md §2.1).
    { id: "add-child", label: "サブブランドを追加", blockedReason: null, danger: false },
    // Inheritance is a pointer, set here, never by where the row sits.
    { id: "set-parent", label: "継承元を指定…", blockedReason: null, danger: false },
    deleteAction(
      "ブランドを削除",
      parts.length > 0 ? `${parts.join("と")}を削除してください` : null,
    ),
  ];
}

export function logoActions(): TreeAction[] {
  // Duplicating a logo would mean copying its master SVG into a second Logo
  // entity with its own presentation Take. That is a real feature, but not a
  // menu item away — until it exists, offering it disabled would be a lie
  // about what is coming.
  return [infoAction(), deleteAction("ロゴを削除", null)];
}

export function takeActions(kind: "video", facts: TakeActionFacts): TreeAction[] {
  const noun = { video: "動画" }[kind];
  return [
    infoAction(),
    duplicateAction(),
    deleteAction(
      `${noun}を削除`,
      facts.published ? "公開中です。先に公開を終了してください" : null,
    ),
  ];
}

/** The line under the confirm dialog's title: what else disappears with it.
 *  Takes the name so the sentence reads as one sentence — a fragment the dialog
 *  glues a quoted name in front of comes out as 「秋の展示会」この動画と…. */
export function deletionConsequence(kind: TreeNodeKind, name: string): string {
  const subject = `「${name}」`;
  switch (kind) {
    case "brand":
      return `${subject}と、採用済みのデザインルール・ブランド知識・共有設定を削除します。`;
    case "logo":
      return `${subject}と、そのプレゼンテーション・生成モックアップ・タグ・作業履歴を削除します。`;
    case "video":
      return `${subject}と、書き出したMP4・レンダー履歴を削除します。`;
  }
}
