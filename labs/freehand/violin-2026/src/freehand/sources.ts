// What each picture stands on — the freehand art-direction layer.
//
// The shot list is FINDINGS.md's, said in code. Every scene carries TWO
// grounds: the one it is designed for (`hero`, the generated material) and
// the one it stood on before that material existed (`placeholder`, built
// from velvet, the chandelier bokeh and the four supplied photographs).
//
// WHY BOTH, STILL. Eighteen stills have landed (thirteen generated on
// 2026-09-10, five more on 2026-09-15, plus the client's own key visual), so
// `available` is true everywhere and the hero is what renders. The placeholders stay
// because a still can be withdrawn — a frame that reads wrong, a re-generation,
// a shot the client does not want — and the film has to stay watchable the
// moment one is. Flip `available` back to false and that scene lands on a
// finished picture rather than on a hole. This is the material version of the
// 捏造の方針: never show an empty slot, never claim something is there that
// is not.
//
// FILE NAMES. Every generated shot is named by its ASSET-PROMPTS.md id
// (a1…e5), and each id reserves BOTH paths:
//   video  public/assets/video/<id>.mp4
//   photo  public/assets/photo/<id>.jpg
// Eight ids landed as CLIPS as well (a1 a2 a3 a4 b1 b2 b3 d1), and
// `landed: "video"` on a shot is what picks the clip. The 2026-09-15 drop
// (a5 b5 b6 b7 c1) is stills only, by the client's word that stills will do.
//
// a0 IS NOT GENERATED. It is the event's official key visual, supplied
// 2026-09-15, and it is the one daylight photograph the film keeps on
// purpose: the client's picture of the client's instrument. The renderer has no filesystem — a Remotion bundle cannot
// stat a file — so this is the only place that knows which exists.
//
// AN ID IS USED ONCE PER SCENE. Until 2026-09-11 a3, b1 and b2 each played as
// a clip and came back as a still at another distance; the client saw the
// same picture twice ("同じシーンが2回出たように見える"). The five stills of
// 2026-09-15 exist to end that: every scene now rests on a DIFFERENT picture
// from the one it moved on.
//
// WHAT A CLIP MAY NOT DO. It plays once, never loops, and its slot ends
// BEFORE the file does: a clip that runs out freezes, and a freeze inside a
// dissolve reads as a dropped frame. The arithmetic is slot + 18 (the
// dissolve it is covered by) against the file's length, and every clip below
// leaves at least 0.35s behind. It is also locked off — a clip carries its
// own camera, so `drawable` gives it no focus and no Ken Burns.
//
// Seven clips are 1344x768 at 24fps (a1 is 1920x1080); cover scales the small
// ones 1.43x and crops 8.6px from the top and bottom, which is what puts the
// letterbox edge at clip fraction 0.1172 — see the b2 measurement below.
//
// GEOMETRY OF THE GENERATED STILLS — the reason `focus` is barely used below.
// Every one of them is 1456×816 (1.784:1) laid into a 1920×1080 frame
// (1.778:1). `object-fit: cover` therefore scales by 1080/816 = 1.324 and
// leaves SEVEN PIXELS of horizontal slack in the whole frame, so
// object-position can move the picture by at most 3.5px: `focus` is inert on
// this material. Reframing is done with the camera move's drift instead, and
// the relation is simple — scaling happens about the centre, so
//
//   image fraction under the centre of the frame  =  0.5 − x/100   (y likewise)
//
// and the drift that can be asked for is bounded by what the scale has
// already covered; past it an edge of the picture walks into shot:
//
//   |x| ≤ 50.19 − 50/s          |y| ≤ 50 (s − 1)/s
//
// At s = 1.10 that is 4.7% of the frame across and 4.5% down. A still that
// has to be reframed further has to be scaled up to pay for it, and only two
// are: c3 (out of focus already, so the upscale costs nothing) and b4, which
// is cut against itself.
//
// HOW LONG THE SHOTS ARE. The narration is recorded (111.66s) and the scenes
// run 4–19 seconds. A single still cannot hold fifteen of them, so every long
// scene is cut in two. Programme III has only one photograph of the bench, so
// it is cut against ITSELF at two framings — which is exactly what the drift
// budget above is for.
//
// THE PUSH IS SMALL ON PURPOSE. 1456 across a 1920 frame is already a 1.32×
// upscale; a 1.10 Ken Burns takes it to 1.45×, which is the most this
// material carries without going soft.

import type { GroundShot } from "./Ground";
import type { CameraMove } from "./Photo";

/** The two paths every generated shot reserves. */
export const heroVideo = (id: string): string => `assets/video/${id}.mp4`;
export const heroPhoto = (id: string): string => `assets/photo/${id}.jpg`;

export interface HeroShot {
  /** ASSET-PROMPTS.md id, or null when the shot is supplied material. */
  id: string | null;
  /** Used when `id` is null: a file already in public/. */
  src?: string;
  /** Share of the scene (normalised against the sum). */
  weight?: number;
  /**
   * Which of the two files this id actually landed as. Defaults to the
   * still, which is what all thirteen are today.
   */
  landed?: "video" | "photo";
  /**
   * Ken Burns for the still form. A clip moves itself and ignores this.
   * On 1456×816 material the reframing lives here, not in `focus`.
   */
  focus?: { x: number; y: number };
  move?: CameraMove;
  grade?: string;
}

export interface GroundSpec {
  kind: "sequence" | "image" | "video" | "velvet";
  shots?: GroundShot[];
  src?: string;
  focus?: { x: number; y: number };
  move?: CameraMove;
  grade?: string;
  /** velvet only: a house light crossing the frame once. */
  sweep?: boolean;
  /** A wash of colour over the whole ground, 0–1. */
  wash?: number;
  /** The wash's colour. Bordeaux by default; varnish for the workshop. */
  washColor?: string;
}

export interface SceneGround {
  /** The picture this scene is designed for, once its material exists. */
  hero: { available: boolean; shots: HeroShot[] } | null;
  /** What it stands on until then. */
  placeholder: GroundSpec;
}

/** The supplied photograph of the instrument — the only object photo we have.
 *  Square (1440×1440), so every 16:9 crop of it is a decision, and it is the
 *  one shot in the film where `focus` does real work. */
const VIOLIN = "assets/photo/violin-hero_1440w.jpg";

/** The Ken Burns a generated still gets when the shot does not name one. */
const PUSH: CameraMove = { scaleFrom: 1.02, scaleTo: 1.1 };

/**
 * Generated material that is IN but not cast — held in reserve, not missing.
 *
 * Distinct from `pendingGrounds()` below, which names scenes still waiting on
 * a picture. This names pictures still waiting on a scene: if a shot has to be
 * pulled, this is what there is to put in its place without generating
 * anything.
 */
export const SPARE_SHOTS: ReadonlyArray<{ id: string; note: string }> = [
  {
    id: "a2-strings-macro (still)",
    note: "The clip of this id is cast in the title; the photograph is not. Left third black, right two thirds bright wood — a replacement for any scene whose copy sits left.",
  },
  {
    id: "violin-hero_1440w (supplied)",
    note: "The square photograph of the instrument, benched from the title by the client 2026-09-11. The official key visual (a0) now holds that slot; this one stays as the only other picture of the actual instrument.",
  },
  {
    id: "a3-hall-chandelier (still) / b1-stage-spotlight (still) / b2-three-violins (still)",
    note: "Each played as a clip AND returned as a still until 2026-09-15; the stills were replaced by a5 / b5 / b6 so no scene shows one picture twice. The files stay — a clip that has to be pulled can fall back to its own still.",
  },
  {
    id: "e5-auditorium-seats (second framing)",
    note: "The invitation used the seats twice; c1 (reception) took the second slot 2026-09-15. The wide framing still opens the scene.",
  },
];

/** A hero shot as something the Ground layer can draw. */
const drawable = (shot: HeroShot): GroundShot => {
  const asVideo = shot.landed === "video";
  const src = shot.id ? (asVideo ? heroVideo(shot.id) : heroPhoto(shot.id)) : shot.src!;
  return {
    kind: asVideo ? "video" : "image",
    src,
    weight: shot.weight,
    // A clip carries its own motion, so it is locked off: no focus, no Ken
    // Burns, only a grade. Saying that here rather than relying on the Ground
    // layer to ignore the fields keeps the two files from disagreeing.
    ...(asVideo ? {} : { focus: shot.focus, move: shot.move ?? PUSH }),
    grade: shot.grade,
  };
};

export const GROUNDS: Record<string, SceneGround> = {
  // 4.00s / 120f. a1 landed as a CLIP and plays whole: the curtain lit from
  // above with the house bokeh across the top, moving on its own. 120 frames
  // against a 5.18s file, so the cut comes 1.2s before it could freeze.
  //
  // a1 is the one clip delivered at 1920x1080; the other seven are 1344x768
  // and are upscaled 1.43x by cover. Measured on the mark's band the curtain
  // reads 9.6-9.8 through the whole clip, which is darker than the still was
  // and darker than the velvet it replaced.
  logoIn: {
    hero: {
      available: true,
      shots: [
        {
          id: "a1-opening-curtain",
          landed: "video",
          grade: "saturate(0.95) contrast(1.03)",
        },
      ],
    },
    placeholder: { kind: "velvet", sweep: true },
  },

  // THE TITLE STANDS ON THE KEY VISUAL. a0 is the event's official picture
  // (2026-09-15): the instrument on its case in daylight, 1920x1082, warm
  // amber on pale wood. It is the one daylight frame the film keeps, because
  // it is the client's own picture of the thing the evening is about.
  //
  // It is also the brightest ground in the film by a factor of six (whole
  // frame 124 against 14-43 for the night stills; left band 134 where the
  // copy sits). The grade takes it down to a lamplit amber rather than to
  // night, and the scrim (0.9, left, scenes.tsx) does the rest. Measured on
  // the rendered still: at brightness 0.58 / scrim 0.86 the copy block read
  // 56 (p90 78) — legible, but three times the film's other copy zones
  // (16-26) — so both came down a step. Saturation comes down with the
  // brightness so the orange reads as varnish, not as a filter.
  //
  // 1920x1082 in a 1920x1080 frame: cover scales by 1080/1082 and leaves no
  // slack at all, so `focus` is inert and the reframing is drift. The push
  // is small (1.04 -> 1.12) and drifts the instrument RIGHT, off the copy:
  // |x| <= 50.19 - 50/s is 4.7% at 1.10, and 4 is what is asked for.
  //
  // One shot, not two. The title line is 25 characters now and the scene
  // runs about six seconds; a second picture would be a cut for its own
  // sake. a2 and a4 (the macro clips that held this scene until today) are
  // free — a4 still opens the value scene.
  title: {
    hero: {
      available: true,
      shots: [
        {
          id: "a0-key-visual",
          move: { scaleFrom: 1.04, scaleTo: 1.12, xFrom: 2, xTo: 4, yFrom: 1, yTo: 2 },
          grade: "saturate(0.68) sepia(0.12) brightness(0.52) contrast(1.06)",
        },
      ],
    },
    placeholder: {
      kind: "sequence",
      shots: [
        {
          kind: "image",
          src: VIOLIN,
          weight: 0.55,
          focus: { x: 0.5, y: 0.45 },
          move: { scaleFrom: 1.2, scaleTo: 1.32, xFrom: 8, xTo: 6 },
          grade: "saturate(0.62) sepia(0.24) brightness(0.8) contrast(1.06)",
        },
        {
          kind: "image",
          src: VIOLIN,
          weight: 0.45,
          focus: { x: 0.5, y: 0.98 },
          move: { scaleFrom: 1.55, scaleTo: 1.72 },
          grade: "saturate(0.78) sepia(0.12) brightness(0.84) contrast(1.04)",
        },
      ],
    },
  },

  // 16.47s / 494f, three shots: the ceiling as a clip, the case, then back to
  // the ceiling at a different distance. Copy is on the RIGHT here.
  //
  // The clip holds 143f (4.77s) of a 5.18s file. a3 is the one daylight
  // picture in a two-minute night — its copy zone climbs 48 -> 53 -> 70 as
  // the camera rises — so brightness 0.55 puts the end of it near 38 and the
  // start near 27, and the saturation comes down with it: beige, not cream.
  //
  // e2 needs no darkening at all (19.4 under the copy). The case runs the
  // full width with its widest, reddest end on the right, so it drifts LEFT
  // to leave the type somewhere to land.
  //
  // Shot 3 is a5, the salon: eight chairs in a ring around one lit music
  // stand — the 少人数 the line is about, said as a room. Its right third
  // measures 17 (curtain), so the copy needs nothing; the lamp on the left
  // is the one bright thing (83) and is the subject. It replaced a3's still
  // on 2026-09-15 because the ceiling had already played as a clip in this
  // scene and came back looking like a repeat.
  value: {
    hero: {
      available: true,
      shots: [
        {
          id: "a3-hall-chandelier",
          landed: "video",
          weight: 0.2437,
          grade: "saturate(0.68) brightness(0.55) contrast(1.03)",
        },
        {
          id: "e2-case-lining",
          weight: 0.3,
          move: { scaleFrom: 1.05, scaleTo: 1.13, xFrom: -2, xTo: -4 },
          grade: "saturate(0.95) brightness(0.95)",
        },
        {
          id: "a5-salon-circle",
          weight: 0.4563,
          move: { scaleFrom: 1.06, scaleTo: 1.14, xFrom: 1, xTo: 2 },
          grade: "saturate(0.85) brightness(0.82) contrast(1.03)",
        },
      ],
    },
    placeholder: {
      kind: "sequence",
      wash: 0.42,
      shots: [
        { kind: "velvet", weight: 0.42 },
        {
          kind: "image",
          src: VIOLIN,
          weight: 0.58,
          focus: { x: 0.5, y: 0 },
          // Tighter than the title's crop and drifting left, which is what
          // pushes the daylight window (image columns 0–0.18) out of frame:
          // at 1.38× the visible band is x 0.18–0.90, y 0.08–0.48.
          move: { scaleFrom: 1.38, scaleTo: 1.52, xFrom: -4, xTo: -2 },
          grade: "saturate(0.5) sepia(0.4) brightness(0.62) contrast(1.08)",
        },
      ],
    },
  },

  // I — the Stradivari heard live. 37.3s / 1118f since the 2026-09-15
  // recording (the line now opens with 「このイベントでは、3つのコンテンツを」
  // and closes on the accordionist), five shots.
  //
  // THE WEIGHTS HERE ARE NOT FREE. Every clip is pinned at its ceiling — the
  // first at 144f, the dissolved ones at 126f + 18f — against 5.18s files,
  // and the still absorbs whatever the narration does. scripts/scene-frames.ts
  // reports any slot that would outrun its file; run it after every re-cut.
  //
  // The order follows the line. b1 — an empty stage, one shaft of light, a
  // stool and a stand — while the voice says what the evening is; a2, the
  // strings and bridge in macro, on 「銘器の音色を、目の前で」; b3 answers
  // from the house, hands on an armrest, as the violinist is named; a4, the
  // scroll, on the bow; and b5, the instrument alone on its plinth, holds the
  // last twenty seconds while the players' portraits stand beside it. a2 and
  // a4 were the title's clips until the key visual took the title
  // (2026-09-15); they carry the grades they had there, copy-left both times.
  //
  // b1's left third is the darkest thing in the film and the copy sits there;
  // almost nothing is graded, because the shaft is the subject and keeps its
  // own light.
  //
  // The last shot is b5 — the instrument alone on a red velvet plinth under
  // one spot, black all round (left band 0.9, whole frame 13.5). It holds
  // the rest of the scene, the longest single picture in the film, and it
  // can: there is nothing in it to tire of. It took B1's still slot on
  // 2026-09-15 (the stage had already played as a clip here).
  //
  // The instrument sits at image x 0.48-0.61 and the pair of portraits
  // (scenes.tsx) starts at frame x 1092, so the picture drifts LEFT a little
  // to keep the scroll out from under the violinist's photograph: x = -5.5
  // puts image 0.555 under the centre and the instrument at about frame
  // 790-1080. s = 1.15 pays for 6.7% of drift. The violinist is an inset,
  // real in all three.
  program0: {
    hero: {
      available: true,
      shots: [
        {
          id: "b1-stage-spotlight",
          landed: "video",
          weight: 0.1288,
          grade: "saturate(0.88) brightness(0.92)",
        },
        {
          id: "a2-strings-macro",
          landed: "video",
          weight: 0.1127,
          grade: "saturate(0.8) brightness(0.52) contrast(1.04)",
        },
        {
          id: "b3-listening",
          landed: "video",
          weight: 0.1127,
          grade: "saturate(0.9) brightness(0.95)",
        },
        {
          id: "a4-scroll-macro",
          landed: "video",
          weight: 0.1127,
          grade: "saturate(0.85) brightness(0.95)",
        },
        {
          id: "b5-violin-on-stand",
          weight: 0.5331,
          move: { scaleFrom: 1.12, scaleTo: 1.18, xFrom: -5, xTo: -6, yFrom: 1, yTo: 0 },
          grade: "saturate(0.95) brightness(0.96)",
        },
      ],
    },
    placeholder: { kind: "velvet", sweep: true },
  },

  // II — the blind listening, 16.2s / 487f, three shots.
  //
  // WHERE THE b2 CLIP IS CUT, AND WHY. The clip rotates in: the three
  // instruments grow until they fill the frame, and the scrolls climb out of
  // the top of it. Measured on frames pulled at 0.1s — the file is 1344x768,
  // which cover scales 1.43x and crops 8.6px off the top, so the letterbox
  // hides everything above clip fraction 0.1172 — the topmost scroll sits at
  //
  //   2.5s 0.1263 (+10.0px)   2.8s 0.1198 (+2.9px)   3.0s 0.1172 (0.0px)
  //   2.6s 0.1250 ( +8.6px)   2.9s 0.1185 (+1.4px)   3.1s 0.1133 (-4.3px)
  //
  // so 3.0s is the last frame with the instruments whole and 3.1s is already
  // decapitated. The slot is 96f = 3.20s and the shot that follows starts
  // dissolving over it at 2.60s, so by 3.0s the scrolls are already two
  // thirds gone under the bow hair. (v6 had let this slot drift to 4.50s when
  // the scene grew — the weights are shares, and a share of a longer scene is
  // a longer slot. Re-pinned 2026-09-15; the check in scene-frames.ts only
  // catches a clip that runs OUT, not one that runs too long for its subject.)
  //
  // e1 (bow hair) holds 165f. It is the brightest still in the set — the hair
  // reads 186 at the 90th percentile under the copy — so it is halved in
  // brightness and pushed down, which drops the band of hair below the type.
  //
  // Shot 3 is b6, three scrolls against a pale wall — the same three
  // instruments as the clip, seen from where the game is played. It is the
  // ONE bright still in the set (whole frame 101; the wall reads 156 on the
  // right) and the copy sits left, where the picture is already dark (26).
  // brightness 0.5 with a little sepia takes the wall to about 78 — a wall
  // under lamplight rather than daylight — and leaves the scrolls' varnish
  // its colour. It replaced b2's own still on 2026-09-15, which had been the
  // softest frame in the film (1.82x) and a repeat of the clip.
  //
  // The copy wraps to two lines here and only here — see PROGRAM_COPY_WIDTH
  // in scenes.tsx.
  program1: {
    hero: {
      available: true,
      shots: [
        {
          id: "b2-three-violins",
          landed: "video",
          weight: 0.1971,
          grade: "saturate(0.92) brightness(0.95)",
        },
        {
          id: "e1-bow-hair",
          weight: 0.3388,
          move: { scaleFrom: 1.08, scaleTo: 1.16, yFrom: 3, yTo: 5 },
          grade: "saturate(0.8) brightness(0.52) contrast(1.03)",
        },
        {
          id: "b6-three-scrolls",
          weight: 0.4641,
          move: { scaleFrom: 1.04, scaleTo: 1.1, yFrom: -1, yTo: -2 },
          grade: "saturate(0.9) sepia(0.2) brightness(0.5) contrast(1.05)",
        },
      ],
    },
    placeholder: { kind: "velvet" },
  },

  // III — the maker's bench, then the appraiser's desk. Two pictures now:
  // b4 (the workbench, shavings and the unvarnished body) and b7 (a dark
  // desk, one lamp, a loupe and a cloth beside an old instrument — the
  // 資産としての楽器 half of the talk, said as an object). Until 2026-09-15
  // the scene was b4 cut against itself at two framings, which the client
  // read as the same picture twice.
  //
  // b4's framing is stated as drift, per the geometry note: x=+5 puts image
  // fraction 0.45 under the centre of the frame (the tools and the lamp).
  // Copy is on the RIGHT, where both pictures are darkest (b4 17.5, b7 7.5);
  // the maker's portrait and the moderator's are the insets on the left,
  // over the tools and later over the lamp.
  //
  // The bench is lamplit and bright (62.5 under the copy) so it has to come
  // down, but the first pass took the saturation to 0.78 with it and the
  // shavings went grey — a workshop with the wood taken out of it. Held at
  // 0.95 with a little sepia, the lamp stays amber, which is the one warm
  // thing in the scene and half the reason the shot is here.
  program2: {
    hero: {
      available: true,
      shots: [
        {
          id: "b4-atelier",
          weight: 0.5,
          move: { scaleFrom: 1.12, scaleTo: 1.18, xFrom: 5, xTo: 6, yFrom: 2, yTo: 1 },
          grade: "saturate(0.95) sepia(0.14) brightness(0.56) contrast(1.06)",
        },
        {
          id: "b7-appraisal-desk",
          weight: 0.5,
          move: { scaleFrom: 1.06, scaleTo: 1.14, xFrom: 2, xTo: 3, yFrom: -1, yTo: -2 },
          grade: "saturate(0.95) sepia(0.1) brightness(0.9) contrast(1.04)",
        },
      ],
    },
    placeholder: { kind: "velvet", wash: 0.34, washColor: "#7a2e1c" },
  },

  // The invitation — the longest scene in the film. Three short lines stand
  // through all of it (scenes.tsx); only the ground changes underneath.
  //
  // e5 opens it wide on the empty rows; c1 (the reception — coupes and a
  // closed case on a dark table, lamps far behind, guests as silhouettes)
  // answers it, and d1 closes the film's argument: a speaker walking to the
  // podium, shot from behind (no face — checked frame by frame, which is why
  // this one can be used at all). c1 landed 2026-09-15 and took the slot e5's
  // second framing had held; c2 (the doors) was never generated.
  //
  // c1's glasses are the bright thing (the centre band reads 37 whole, the
  // row of stems well over 150) and the three lines sit right across them:
  // there is no drift inside the budget that moves a 250px row of glass out
  // from under 260px of type. So it is darkened twice — brightness 0.6 here
  // and the scene's radial scrim (scenes.tsx) — which is what took the copy
  // block from 47 (p90 111) on the first still to the range the podium and
  // the rows sit in.
  //
  // d1 is the only 6.59s clip and it holds 167f plus its 18f dissolve, 185f
  // = 6.17s, leaving 0.42s of file behind the cut. Its copy zone measures
  // 15.5-17.6 the whole way through — the man is a silhouette in a dark suit
  // — so the centred 152px date needs no extra scrim over him.
  cta: {
    hero: {
      available: true,
      shots: [
        {
          id: "e5-auditorium-seats",
          weight: 0.3525,
          move: { scaleFrom: 1.06, scaleTo: 1.12, yFrom: -2.5, yTo: -4 },
          grade: "saturate(0.9)",
        },
        {
          id: "c1-reception",
          weight: 0.3525,
          move: { scaleFrom: 1.05, scaleTo: 1.12, yFrom: -2, yTo: -3 },
          grade: "saturate(0.85) brightness(0.6) contrast(1.05)",
        },
        {
          id: "d1-podium-standin",
          landed: "video",
          weight: 0.295,
          grade: "saturate(0.9) brightness(0.9)",
        },
      ],
    },
    placeholder: { kind: "velvet" },
  },

  // The end card, 4.0s. c3 is gold bokeh on black — the right picture for the
  // last frame and the wrong one for centred type (a line and, under it, the
  // mark since 2026-09-15), because the discs are in a single band across
  // the MIDDLE of the file (image rows 0.40–0.55 measure
  // 136–165, against 15–17 below row 0.65). The mark would sit in the brightest
  // part of the frame.
  //
  // Reaching the black below the band means putting image fraction ~0.63
  // under the centre of the frame, i.e. y = -13, and the budget for that is
  // |y| <= 50(s-1)/s, so s >= 1.38. That upscale is free here and nowhere
  // else: the picture is already out of focus, so there is no detail to lose.
  //
  // Measured on the band the mark actually sits in: 131 unshifted, 67 at the
  // first pass (s 1.28, y -10, which still put a disc behind "Lab"), 40 here.
  // Brightness 0.58 takes that to ~24, and the saturation goes UP rather than
  // down — at 0.9 the discs read as grey haze, and the one thing this frame
  // has to be is gold.
  logoOut: {
    hero: {
      available: true,
      shots: [
        {
          id: "c3-end-bokeh",
          move: { scaleFrom: 1.4, scaleTo: 1.48, yFrom: -13, yTo: -13.5 },
          grade: "saturate(1.12) brightness(0.58) contrast(1.04)",
        },
      ],
    },
    placeholder: { kind: "velvet" },
  },

  // `guests` has no entry because the picture no longer exists: the client
  // took the three-panel introduction out on 2026-09-14 (props.json
  // provenance.guests is suppressed) and the speakers are introduced where
  // they appear — the two players beside programme I, the maker and the
  // moderator beside programme III (scenes.tsx).
};

/** The ground a scene actually gets today. */
export const groundOf = (key: string): GroundSpec | null => {
  const scene = GROUNDS[key];
  if (!scene) return null;
  if (!scene.hero?.available) return scene.placeholder;
  return { kind: "sequence", shots: scene.hero.shots.map(drawable) };
};

/** Which scenes are still standing on a placeholder — for the render log.
 *  Empty since the material drop; kept because pulling a shot refills it. */
export const pendingGrounds = (): string[] =>
  Object.entries(GROUNDS)
    .filter(([, scene]) => scene.hero !== null && !scene.hero.available)
    .map(([key]) => key);
