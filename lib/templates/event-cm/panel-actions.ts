import {
  EVENT_CM_SCENES,
  eventCmScenePath,
  eventCmScenePlan,
  type EventCmBrief,
  type EventCmSceneRole,
} from "@/remotion/event-cm/types";

// What you can do to one picture of the film, and what to say when you cannot.
//
// Same shape as lib/brand-tree-actions.ts, and for the same reason: the answer
// is a rule about the template, so it lives next to the template rather than
// inside a button. A menu is not the authority — the server applies the same
// function before writing anything (app/api/brands/[id]/videos/[videoId]/
// panels/route.ts). The client used to compose that write itself, which made
// the button a second author of briefs.
//
// The template's shape is fixed and declares itself (remotion/event-cm/types.ts
// EVENT_CM_SCENES): nine pictures, of which `guests` and the three `program`
// pictures carry `removable: true`. This file does not keep its own list of
// what may go — it asks. The two used to be written down separately, which is
// a way of saying the menu and the renderer could disagree about the film.
//
// Deletion is always a SUPPRESSION now: the picture goes, the values stay, and
// it can be put back. Removing a programme from `programs` used to be how an
// agenda picture went away, which only worked while the number of pictures
// followed the number of items. With three pictures fixed, dropping the item
// leaves the frame standing with nothing in it — and calling that "delete"
// would be a lie.

export type PanelDeletion =
  | {
      can: true;
      /** Switch the picture off: the values stay, the picture goes. */
      kind: "suppress";
      path: string;
      confirm: string;
    }
  | { can: false; reason: string };

const FIXED: Partial<Record<EventCmSceneRole, string>> = {
  logoIn:
    "提供のマークは外せません。オープニングとエンドカードは「誰の動画か」を言う場所です",
  logoOut:
    "提供のマークは外せません。オープニングとエンドカードは「誰の動画か」を言う場所です",
  title: "タイトルのシーンは外せません。告知は自分の名前を先に言います",
  value: "テーマのシーンは外せません。来る理由の無い告知になります",
  cta: "CTAのシーンは外せません。見た人が次にできることが無くなります",
};

export function panelDeletion(
  brief: EventCmBrief,
  panel: { role: EventCmSceneRole; index?: number },
): PanelDeletion {
  const declared = EVENT_CM_SCENES.find((scene) => scene.role === panel.role);
  if (!declared?.removable) {
    return { can: false, reason: FIXED[panel.role] ?? "このシーンは削除できません" };
  }

  if (panel.role === "guests") {
    return {
      can: true,
      kind: "suppress",
      path: "guests",
      confirm: "登壇者紹介のシーンを削除します。登壇者の情報は残るので、あとで戻せます",
    };
  }

  // アジェンダ names the picture, プログラム the items on it — the split is
  // deliberate (EVENT_CM_SCENE_LABELS), so a sentence about both uses both.
  if (panel.index === undefined) {
    return { can: false, reason: "どのアジェンダのシーンかが分かりません" };
  }
  // The last agenda picture keeps its place: the template opens the middle of
  // the film with what happens at the event, and a film that skips it announces
  // an evening with no content. Editing the text is what that case wants.
  const showing = eventCmScenePlan(brief).filter(
    (scene) => scene.role === "program",
  ).length;
  if (showing <= 1) {
    return {
      can: false,
      reason:
        "アジェンダのシーンは1つ残ります。内容はこのシーンで直せます（2つ以上出ているときは、1つずつ削除できます）",
    };
  }
  return {
    can: true,
    kind: "suppress",
    path: eventCmScenePath(panel),
    confirm: `アジェンダ${panel.index + 1}のシーンを削除します。プログラムの内容は残るので、あとで戻せます`,
  };
}
