// The default asset pool.
//
// A seeded deliverable is dressed from here: the BGM, the ink art behind a
// title, the texture on a ground, the b-roll under a scene. None of it belongs
// to the brand, all of it is recorded as `inferred`, and every slot it fills
// is one the user can replace with their own material.
//
// SOUND EFFECTS ARE POOLED SEPARATELY, on purpose. Music is chosen — one track
// per film, by a person, from a list they read. Effects are not: a template
// rings its own structure (lib/event-cm/sfx-cues.ts asks for a role and a
// presence, never for a file), so their catalog is generated at ingest with a
// measured level per file rather than hand-written here — see
// scripts/fetch-default-sfx.mjs and public/defaults/sfx/catalog.json. `sfx`
// stays in ASSET_KINDS so the two pools are one vocabulary the day somebody
// wants to swap a cue by hand.
//
// The point of the pool is that it compounds. A template declares the KINDS of
// asset its slots take; enriching the pool with better tracks and better
// footage improves every default film at once, with no template change. So the
// catalog is a list of files with tone and format, not a per-template mapping.
//
// Slots that the pool cannot fill are not a failure: the event templates ship
// designed fallbacks for every visual slot (an ink ground and gold particles
// where a photo would be), so an empty pool still produces a finished film.
// That is why this can start nearly bare and grow.

// `portrait` is a picture OF A PERSON, and it is deliberately not one of the
// VISUAL_KINDS below: a face cannot stand in for a backdrop. Trying it is a
// measured failure (freehand v1 reused a speaker photo as a ground — `cover`
// cannot push a face out of frame), and it is the reason Phase A3 wants
// "is there a person in this" as a measured property of every material.
export const ASSET_KINDS = [
  "bgm",
  "sfx",
  "ink_art",
  "texture",
  "b_roll",
  "still",
  "portrait",
  "mark",
] as const;
export type DefaultAssetKind = (typeof ASSET_KINDS)[number];

export interface DefaultAsset {
  id: string;
  kind: DefaultAssetKind;
  /** Path under public/, served as a same-origin static file. */
  src: string;
  /** Art-direction family. Templates ask for a tone, not a file. */
  tone: string;
  /**
   * What a person choosing between tracks reads.
   *
   * The FEELING, not the file. It said 「明るい（東京・3分）」 and 「明るい
   * （コーポレート）」 — a working name and a note to ourselves, shown to a
   * customer (owner, 2026-08-30). A person picking music is choosing a mood,
   * so the word has to be one: ポップ / 都会的 / 和モダン.
   */
  label: string;
  /**
   * A few words about the sound, under the label.
   *
   * Genre and character, three or four words. NOT the tool that made it: a
   * customer choosing music has no use for 「Suno AI（商用利用可プランで生成）」,
   * which is a licensing record and belongs to `credit` below and to this file.
   *
   * Optional, because only the music picker shows one. A picture is chosen by
   * looking at it.
   */
  keywords?: string[];
  /**
   * Where a default came from, for the record.
   *
   * NOT shown in the picker — see `keywords`. It is what answers a licensing
   * question, and licensing questions are asked of us, not of the screen.
   */
  credit: string;
  /**
   * Multiplier that plays this file AS LOUD AS ITS OWN HEADROOM ALLOWS.
   *
   * **Levelling, not a mix decision.** The SFX pool has done this since it was
   * built (scripts/fetch-default-sfx.mjs → catalog.json) and the BGM pool never
   * did, so two tracks mastered 5.5 dB apart — bright-corporate at −11.1,
   * ink-cinematic at −16.6 — were handed the same volume by the composition.
   * That made the film's music level a property of whoever mastered the chosen
   * track: swapping the BGM changed the mix, and the ink track sat about 10 dB
   * under the narration where it was supposed to sit just under it.
   *
   * The reference was −16 dBFS RMS until 2026-08-26, when the requester heard
   * the music as roughly a third of what it should be — twice, after a first
   * raise. −16 was chosen as the loudest the QUIETER track could reach, and
   * then applied to both, so the louder track was held 5 dB below its own
   * ceiling for symmetry nobody asked for. The rule is now the ceiling itself:
   * every track plays as loud as it can without clipping (−0.8 dBFS true peak),
   * and the RMS target only matters for a track with headroom to spare.
   *
   * **AND NEVER ABOVE 1.0** (2026-08-30). Remotion documents `volume` as 0–1,
   * so a number above it is outside the contract and is the one place the
   * browser preview and the encoder are free to disagree — which is what
   * produced 「プレビューで微調整してMP4に書き出すと全部バランスが変わって
   * しまう」. A level chosen by ear in one player has to be the level the other
   * one applies. Loudness beyond this belongs to the FILE: remaster it.
   *
   * Measured with `npx tsx scripts/measure-default-bgm.mjs`, and committed
   * rather than computed at runtime so a deployment does not have to measure.
   * Absent means unmeasured, so callers treat it as 1 and nothing silently goes
   * quiet.
   */
  gain?: number;
  /**
   * A hand-set adjustment in dB, applied ON TOP of `gain`.
   *
   * `gain` levels a track by measurement, and measurement gets a mix into the
   * right neighbourhood and no further: two tracks at the same RMS can sit
   * completely differently under a film, because how a bed is arranged decides
   * how much of that level a listener actually hears. 「そのまま使ってそのまま
   * うまくいく音声を用意するのは難しいので、結局はそれぞれのBGMにパラメータを
   * 付けて上下させるしかない」 (owner, 2026-08-30) — this is that parameter.
   *
   * **It deliberately overrides the peak ceiling.** `gain` never lifts a track
   * past −0.8 dBFS, because that is where clipping starts; this can, and when
   * it does the loudest transients are squared off in the encode. That is a
   * judgment a person makes by listening, which is exactly why it is kept apart
   * from the measured number rather than folded into it — leave `gain` alone so
   * the measurement stays readable, and record the listening here.
   *
   * If a track needs a large lift, the cleaner answer is to remaster the file:
   * a limiter raises loudness without spending headroom that is not there.
   * This field is for the last few dB.
   */
  gainAdjustDb?: number;
  /**
   * Seconds of the file to skip before playing — an EDIT, not a level.
   *
   * **No track in the pool sets one today, and the reason is worth keeping.**
   *
   * bright-corporate had `startFromSec: 14` from 2026-08-26 to 2026-08-30. It
   * is a 40-second track whose first ~14 seconds sit 7–9 dB under its own body
   * (measured again 2026-08-30 in 5s windows: −17.4 / −16.2 / −13.9 against
   * −10.3 / −10.0 / −9.9 / −9.7 / −9.0), so a 51-second film played half its
   * length against a thin intro and measured as 「BGMが異様に小さい」.
   *
   * The trim fixed the level and broke the music. A trimmed track can only be
   * looped over the part that survived, so the loop restarted at **0:14, not at
   * 0:00** — twice inside a 51-second film, each time a hard cut from the
   * middle of one phrase into the middle of another. And the film opened at
   * 0:14, mid-phrase. The owner heard both and named it exactly: 「突然途中で
   * ブツッと切れてループが始まる」「最初も少し入り方が変」 (2026-08-30).
   *
   * **Those quiet 14 seconds are not a defect; they are the track's build-in.**
   * The measurement said "quiet" and the edit answered "so remove it", which
   * treated an arrangement as an error. Played from the top, the loop seam is
   * the track's OWN end-to-start — the one place a loop is meant to happen —
   * and the quiet intro lands under the closing card, where the film is fading
   * out anyway.
   *
   * The remaining problem is real and is not this field's to solve: a
   * 40-second track under a 51-second film has one seam no matter what. The
   * answer is a longer track (README「BGMはピーク余裕いっぱいまで上げ済み」 —
   * 発注曲で解消), not a smaller piece of this one.
   *
   * Kept as a mechanism because a supplied file CAN have a genuinely dead head
   * — silence, a count-in — and skipping that is not an arrangement decision.
   * Per FILE, because it describes one recording.
   *
   * **A trim needs `durationSec`.** Without one the composition plays the file
   * from the top rather than trimming, because a trimmed track can only be
   * looped by a loop whose length is known, and an intro is a smaller problem
   * than silence.
   */
  startFromSec?: number;
  /**
   * The file's length in seconds, measured.
   *
   * Needed to LOOP AT ALL, on any track short enough to run out. Remotion's
   * own `loop` does not agree across the two surfaces: the 51-second standard
   * film had music for its first 26 seconds and silence afterwards in the
   * browser Player, while the exported MP4 played all the way through
   * (measured 2026-08-26 — 「音は30秒ぐらいで止まってしまう」). Preview and
   * export disagreeing is the one thing this template must never do, so the
   * composition wraps the track in `<Loop>` with an explicit length, which both
   * paths honour. That length is (durationSec − startFromSec).
   *
   * Measure it for every pool track short enough to repeat inside a film. A
   * track without one falls back to Remotion's `loop` and takes that risk —
   * which is the right answer for a file somebody supplied, whose length we
   * have not measured, and the wrong one for a track shipped in the pool.
   */
  durationSec?: number;
  /**
   * The name of the prompt this was generated from.
   *
   * Not user-facing, and NOT a way to regenerate it: a generated picture cannot
   * be restored from its prompt (the same words yield a different image), which
   * is why the bytes are committed. The prompt text is deliberately NOT kept —
   * docs/demo-assets.md holds only what is still being asked for, and deletes a
   * prompt once its picture arrives (owner's decision, 2026-08-26; the text is
   * in that file's git history if anybody wants it).
   *
   * What this string is for is the link between a file and the SLOT
   * REQUIREMENT it was made against — the lighting family, the side left empty,
   * the acceptance checks — and those do not expire (demo-assets §5). Delivered
   * filenames are renamed on the way in, because they carry the generating
   * account's name and that must never reach a viewer, so without this the file
   * cannot be traced back to what it was ordered for at all.
   */
  recipe?: string;
  /**
   * Whether this may be published.
   *
   * False marks a track that is fine for previewing and must not leave the
   * building inside an exported MP4. **The export does not enforce this yet** —
   * `unlicensedDefaults()` has no caller — so today it only drives what the
   * picker says. Every track in the pool is currently cleared, so nothing is at
   * risk; adding one that is not means writing the render-side exclusion first.
   */
  licensed: boolean;
}

/**
 * Music is the first thing the pool carries, because it is the first thing a
 * user will not supply. Nobody uploads a soundtrack; they expect one.
 *
 * Both tracks were generated with Suno AI on a paid plan that grants commercial
 * use, so they are ours to publish: they play in previews AND are burned into
 * exported MP4s (confirmed by the owner, 2026-08-15). They were previously
 * recorded here as client-supplied placeholders from the productions they were
 * first used in, which was wrong about where they came from and kept them out
 * of every export.
 *
 * The bytes are gitignored for the same reason the event photography is; the
 * catalog entry naming them is committed, so a fresh checkout knows what is
 * missing.
 *
 * `licensed: false` remains meaningful for the next track that arrives without
 * clearance — the export refuses it and the picker says so.
 */
export const DEFAULT_ASSETS: DefaultAsset[] = [
  {
    id: "bgm-shine-through-tokyo",
    kind: "bgm",
    src: "defaults/bgm/shine-through-tokyo.mp3",
    tone: "ink",
    label: "ポップ",
    keywords: ["ポップ", "シンセ", "アップテンポ"],
    credit: "Suno AI（商用利用可プランで生成）",
    // RMS −16.2 / peak −0.7 dB. Peak-limited, so 0.989 is as loud as it goes —
    // effectively −16.3 dB, which is where the approved 墨 films sit
    // (ink-cinematic lands on −16.0). It is ~4 dB under bright-corporate, whose
    // master is pushed to full scale; that difference is the two masters, not a
    // mix decision, and levelling cannot take it back without clipping.
    gain: 0.989,
    // NO adjustment. It carried +5 dB for one afternoon, decided in the browser
    // preview, and the exported MP4 came out 「めちゃくちゃ大きな音」 — because
    // the two surfaces were not playing at the same level to begin with, so the
    // adjustment was correcting the preview and being applied to both.
    //
    // Do not set one here until a change has been heard in the EXPORT. The
    // field stays because per-track adjustment is genuinely needed; what it
    // cannot be is a fix for a discrepancy between two players.
    // THREE MINUTES, and that is the point of this track.
    //
    // Every seam problem the pool had came from a 40-second bed under a
    // 51-second film: one loop, always, and nowhere good to put it (see
    // `startFromSec`). A bed longer than the film never reaches its own end, so
    // there is no seam to place. Measured anyway, because a longer film would
    // reach it and the loop has to be stated rather than left to Remotion's
    // `loop` (see `durationSec`).
    durationSec: 180,
    licensed: true,
  },
  {
    id: "bgm-bright-corporate",
    kind: "bgm",
    src: "defaults/bgm/bright-corporate.mp3",
    tone: "ink",
    label: "都会的",
    keywords: ["コーポレート", "クリーン", "ミッドテンポ"],
    credit: "Suno AI（商用利用可プランで生成）",
    // Peak-limited — this file is mastered to full scale, so −0.8 dBFS is the
    // whole of its headroom and 0.912 is as loud as it goes. Was 0.569 (the old
    // −16 dBFS RMS reference), which is 4.1 dB of the file's own loudness given
    // away. Measured over the whole file, so removing the trim does not move
    // it: a peak is a peak wherever it falls.
    gain: 0.912,
    // NO TRIM. It had `startFromSec: 14` for four days; see `startFromSec`
    // above for what that did to the loop and why the quiet first 14 seconds
    // are the track's build-in rather than a fault.
    durationSec: 40,
    licensed: true,
  },
  {
    id: "bgm-ink-cinematic",
    kind: "bgm",
    src: "defaults/bgm/ink-cinematic.mp3",
    tone: "ink",
    label: "和モダン",
    keywords: ["和", "シネマティック", "重厚"],
    credit: "Suno AI（商用利用可プランで生成）",
    // RMS −16.6 / peak −1.4 dB. Was 1.072 — the loudest this file can go before
    // clipping — until 2026-08-30, when the pool took a ceiling of 1.0 because
    // Remotion documents `volume` as 0–1 and the two surfaces stop agreeing
    // above it (scripts/measure-default-bgm.mjs `GAIN_CEILING`). The 0.6 dB
    // this gives up is inaudible; a browser and an encoder disagreeing about
    // the mix is not.
    gain: 1.0,
    // No trim: the shorter intro under the opening mark is part of the approved
    // 墨 films. Measured anyway, so a later trim decision has the number.
    durationSec: 216,
    licensed: true,
  },

  // Pictures, subject "日本文化を学ぶ" — the `sumi` pool (docs/demo-assets.md §2).
  //
  // Generated with Midjourney on a commercial plan, so unlike the licensed
  // stock and the real people's portraits under public/event/, these are ours
  // to redistribute — THE BYTES ARE COMMITTED. That is the whole point: a
  // fresh clone renders a complete film without running an asset script.
  //
  // Every one was measured before it was accepted: the copy side of each still
  // is both darker and quieter than the subject side (the requirement all
  // three slots share, because every event-cm layout puts its words on the
  // left). Verify with `npm run themes:compare`.
  {
    id: "still-tearoom-bowl",
    kind: "still",
    src: "defaults/stills/tearoom-bowl.jpg",
    tone: "ink",
    label: "茶室（茶碗と茶筅）",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-tearoom-01",
    licensed: true,
  },
  {
    id: "still-tearoom-hearth",
    kind: "still",
    src: "defaults/stills/tearoom-hearth.jpg",
    tone: "ink",
    label: "茶室（炉と光）",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-tearoom-02",
    licensed: true,
  },
  {
    id: "still-inkstone",
    kind: "still",
    src: "defaults/stills/inkstone.jpg",
    tone: "ink",
    label: "硯と筆",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-inkstone-01",
    licensed: true,
  },
  {
    id: "still-shoji-vase",
    kind: "still",
    src: "defaults/stills/shoji-vase.jpg",
    tone: "ink",
    label: "障子の光と壺",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-shoji-light-01",
    licensed: true,
  },
  {
    id: "still-venue-lanterns",
    kind: "still",
    src: "defaults/stills/venue-lanterns.jpg",
    tone: "ink",
    label: "会場（座卓と提灯）",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-venue-evening-01",
    licensed: true,
  },
  {
    id: "still-entrance-dusk",
    kind: "still",
    src: "defaults/stills/entrance-dusk.jpg",
    tone: "ink",
    label: "夕暮れの玄関",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-entrance-evening-01",
    licensed: true,
  },

  // The footage the closing plate stands on, one clip per art direction.
  //
  // The approved 和モダン film ends on Fuji above a sea of clouds, darkened
  // until the mark owns the frame (labs/freehand/sake-2026 `sources.ts`), and
  // the carry-back left it behind — the product's end card was a flat plate in
  // both directions until 2026-08-27, when the owner noticed the missing one and
  // supplied the city clip as the corporate substitute.
  //
  // `licensed: false` ON BOTH, AND IT MATTERS. Every other entry in this pool is
  // ours by construction; these two are stock downloads whose source has not
  // been confirmed, so the renderer leaves them out of exports
  // (EventCmComposition reads `unlicensedDefaults`) and the bytes stay out of
  // git. Flip both the day the licence is known — the end card is finished
  // without them either way, because the plate under the footage is the art
  // direction's own ground.
  {
    id: "b-roll-end-card-sumi",
    kind: "b_roll",
    src: "defaults/video/end-card-sumi.mp4",
    tone: "ink",
    label: "富士と雲海（試聴用）",
    credit: "提供素材（出典未確認）",
    // 1920×1080 / 30fps / 8s, from the supplied 8.2MB file. The plate is four
    // seconds, so the clip has only to outlast it — it is never looped.
    durationSec: 8,
    licensed: false,
  },
  {
    id: "b-roll-end-card-light",
    kind: "b_roll",
    src: "defaults/video/end-card-light.mp4",
    tone: "light",
    label: "夕暮れの都市（試聴用）",
    credit: "提供素材（出典未確認）",
    // Re-encoded from the supplied 2560×1440 60fps 24.85s file to 1920×1080
    // 30fps 12s: the film is 1080p and this plays for four seconds of it, so the
    // original was ten times the bytes for no gain.
    durationSec: 12,
    licensed: false,
  },

  // The `standard` pool, subject "ビジネスセミナー" (docs/demo-assets.md §2).
  //
  // A SECOND SET, not a replacement. The two art directions treat a photograph
  // in opposite directions — 墨 darkens the copy side, standard lightens it —
  // so a picture made for one is grey fog in the other, measured on
  // `npm run themes:compare`. Which is why `tone` is load-bearing here rather
  // than decorative: it is how a template asks for pictures that will survive
  // its own scrim.
  //
  // Measured at ingest with `node scripts/check-pool-images.mjs <dir> --tone
  // light`: the left third of each is brighter and flatter than the subject
  // side, because every event-cm layout puts its words there.
  {
    id: "still-light-seminar-table",
    kind: "still",
    src: "defaults/stills/light-seminar-table.jpg",
    tone: "light",
    label: "会議室（白い長机）",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-seminar-table-01",
    licensed: true,
  },
  {
    id: "still-light-seminar-chairs",
    kind: "still",
    src: "defaults/stills/light-seminar-chairs.jpg",
    tone: "light",
    label: "研修室（椅子の列）",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-seminar-room-02",
    licensed: true,
  },
  {
    id: "still-light-desk-notebook",
    kind: "still",
    src: "defaults/stills/light-desk-notebook.jpg",
    tone: "light",
    label: "机の上（ノートとペン）",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-desk-notebook-01",
    licensed: true,
  },
  {
    id: "still-light-corridor",
    kind: "still",
    src: "defaults/stills/light-corridor.jpg",
    tone: "light",
    label: "ガラスの廊下",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-glass-corridor-01",
    licensed: true,
  },
  {
    id: "still-light-corridor-wide",
    kind: "still",
    src: "defaults/stills/light-corridor-wide.jpg",
    tone: "light",
    label: "ガラスの廊下（引き）",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-glass-corridor-01",
    licensed: true,
  },
  {
    id: "still-light-venue-lobby",
    kind: "still",
    src: "defaults/stills/light-venue-lobby.jpg",
    tone: "light",
    label: "会場のロビー",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "still-venue-lobby-01",
    licensed: true,
  },

  // The standard pool's faces: a pale grey studio ground rather than 墨's
  // charcoal, because a dark backdrop behind a face is the one panel that reads
  // as heavy on a white film. Labels describe what a person picking from a list
  // can see — and never who they are (the note below applies to both sets).
  {
    id: "portrait-light-01",
    kind: "portrait",
    src: "defaults/portraits/light-01-white-tee.jpg",
    tone: "light",
    label: "男性・20代・白いTシャツ",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-light-06",
    licensed: true,
  },
  {
    id: "portrait-light-02",
    kind: "portrait",
    src: "defaults/portraits/light-02-navy-knit.jpg",
    tone: "light",
    label: "男性・40代・紺のニット",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-light-02",
    licensed: true,
  },
  {
    id: "portrait-light-03",
    kind: "portrait",
    src: "defaults/portraits/light-03-grey-cardigan.jpg",
    tone: "light",
    label: "女性・30代・グレーのカーディガン",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-light-01",
    licensed: true,
  },
  {
    id: "portrait-light-04",
    kind: "portrait",
    src: "defaults/portraits/light-04-charcoal-blazer.jpg",
    tone: "light",
    label: "女性・50代・チャコールのジャケット",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-light-03",
    licensed: true,
  },
  {
    id: "portrait-light-05",
    kind: "portrait",
    src: "defaults/portraits/light-05-grey-suit.jpg",
    tone: "light",
    label: "男性・60代・グレーのスーツ（眼鏡）",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-light-04",
    licensed: true,
  },
  {
    id: "portrait-light-06",
    kind: "portrait",
    src: "defaults/portraits/light-06-indigo-jacket.jpg",
    tone: "light",
    label: "女性・60代・紺の上着",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-light-05",
    licensed: true,
  },

  // Six DISTINCT fictional people, not variants of one.
  //
  // NO NAMES, here or anywhere. The seed proposes a ROLE (「ゲストスピーカー」)
  // and never a person, and a stock face must not quietly turn that into a
  // named individual — see docs/demo-assets.md §5. The labels below describe
  // what a person picking from a list can see, which is not the same as
  // inventing who they are.
  //
  // 960×1200 is deliberate, not a shortfall: the full-bleed speaker panel is
  // 960×1080, so these are used at native size rather than enlarged.
  {
    id: "portrait-speaker-01",
    kind: "portrait",
    src: "defaults/portraits/speaker-01-suit-glasses.jpg",
    tone: "ink",
    label: "男性・60代・スーツ（眼鏡）",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-speaker-01",
    licensed: true,
  },
  {
    id: "portrait-speaker-02",
    kind: "portrait",
    src: "defaults/portraits/speaker-02-suit.jpg",
    tone: "ink",
    label: "男性・60代・スーツ",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-speaker-01",
    licensed: true,
  },
  {
    id: "portrait-speaker-03",
    kind: "portrait",
    src: "defaults/portraits/speaker-03-blazer.jpg",
    tone: "ink",
    label: "女性・50代・ジャケット",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-speaker-02",
    licensed: true,
  },
  {
    id: "portrait-speaker-04",
    kind: "portrait",
    src: "defaults/portraits/speaker-04-blazer-grey.jpg",
    tone: "ink",
    label: "女性・60代・ジャケット",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-speaker-02",
    licensed: true,
  },
  {
    id: "portrait-speaker-05",
    kind: "portrait",
    src: "defaults/portraits/speaker-05-open-shirt.jpg",
    tone: "ink",
    label: "男性・40代・開襟シャツ",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-speaker-03",
    licensed: true,
  },
  {
    id: "portrait-speaker-06",
    kind: "portrait",
    src: "defaults/portraits/speaker-06-indigo.jpg",
    tone: "ink",
    label: "女性・70代・藍の上着",
    credit: "Midjourney（商用利用可プランで生成）",
    recipe: "portrait-speaker-04",
    licensed: true,
  },

  // Placeholder marks, authored as SVG rather than generated.
  //
  // Generative models cannot make these: a mark needs transparency, hard
  // edges, one colour, and a MEASURABLE luminance — `treatmentOn` reads the
  // artwork to decide whether to knock it out, and a raster approximation of a
  // logo has nothing reliable to measure. Same reason the LP's client logo wall
  // draws its own marks and ships no images.
  //
  // Every gap in them is real transparency, never a white fill. `knockout` is
  // `brightness(0) invert(1)`, so it paints every pixel white — a counter drawn
  // in white looks correct on any light mockup and then swallows the mark on
  // ink. Verified on both grounds before these were committed.
  //
  // `tone: "neutral"` because they read on either ground, which is not true of
  // anything else in the pool. NOT auto-attached to a brand: see the
  // 「ロゴは提案しない」 note in lib/event-cm/seed.ts.
  {
    id: "mark-gate",
    kind: "mark",
    src: "defaults/marks/gate.svg",
    tone: "neutral",
    label: "門（ダミー）",
    credit: "ダミーマーク（このリポジトリで作成）",
    licensed: true,
  },
  {
    id: "mark-ring",
    kind: "mark",
    src: "defaults/marks/ring.svg",
    tone: "neutral",
    label: "環（ダミー）",
    credit: "ダミーマーク（このリポジトリで作成）",
    licensed: true,
  },
  {
    id: "mark-strata",
    kind: "mark",
    src: "defaults/marks/strata.svg",
    tone: "neutral",
    label: "三層（ダミー）",
    credit: "ダミーマーク（このリポジトリで作成）",
    licensed: true,
  },
  {
    id: "mark-lattice",
    kind: "mark",
    src: "defaults/marks/lattice.svg",
    tone: "neutral",
    label: "組子（ダミー）",
    credit: "ダミーマーク（このリポジトリで作成）",
    licensed: true,
  },
];

export const defaultsOfKind = (
  kind: DefaultAssetKind,
  tone?: string,
): DefaultAsset[] =>
  DEFAULT_ASSETS.filter(
    (asset) => asset.kind === kind && (tone === undefined || asset.tone === tone),
  );

/**
 * The default of a kind: the first entry that matches.
 *
 * Ordering is the decision, and it is deliberately not varied per take. An
 * earlier version picked from a stable hash of the take id so different films
 * got different tracks — which is a nice property and the wrong one. A default
 * that differs between two videos of the same brand is not a default; it is a
 * surprise. Variety is what the picker is for, once a user cares.
 */
export const defaultAsset = (
  kind: DefaultAssetKind,
  tone: string,
): DefaultAsset | null => defaultsOfKind(kind, tone)[0] ?? null;

export const assetById = (id: string): DefaultAsset | null =>
  DEFAULT_ASSETS.find((asset) => asset.id === id) ?? null;

/**
 * The track a new take of this template opens with.
 *
 * The template names it (`TemplateEntry.defaultBgm`), because the kind of film
 * decides the music — an event promo and a product film want different tracks,
 * and that is not a fact about whoever is making one. Passing the id rather
 * than the whole entry keeps this module free of the catalog, which imports
 * nothing and must stay that way.
 *
 * A template that names no track, or names one the pool has lost, plays
 * silently. That is a designed state for these templates, not a hole — but it
 * is worth being unsurprised by, which is why nothing here falls back to
 * "some other track".
 */
export const templateBgm = (bgmId: string | undefined): DefaultAsset | null => {
  if (!bgmId) return null;
  const asset = assetById(bgmId);
  return asset?.kind === "bgm" ? asset : null;
};

/** Kinds a visual slot can be dressed with. Music is not one of them. */
const VISUAL_KINDS = new Set<DefaultAssetKind>(["still", "b_roll", "ink_art", "texture"]);

/**
 * The stock picture a template puts in one of its visual slots.
 *
 * Second tier of the ladder: the brand's own picture first, this next, the
 * composition's designed substitute last. Returns null for anything the pool
 * has lost or that is not a picture — a wrong-kind id must not put a music
 * file in a photo slot, and a missing one falls through to tier 3, which is a
 * finished frame rather than a hole.
 */
export const templateVisual = (assetId: string | undefined): DefaultAsset | null => {
  if (!assetId) return null;
  const asset = assetById(assetId);
  return asset && VISUAL_KINDS.has(asset.kind) ? asset : null;
};

/**
 * The stock face a template puts in a speaker slot.
 *
 * Separate from `templateVisual` rather than a wider filter, because the two
 * must not be able to trade places. A face in a backdrop cannot be cropped out
 * of frame (`cover` has nowhere to push it), and a photograph of a room in a
 * medallion is not a person. Both directions are wrong, and one shared
 * accessor would let either happen from a single mistyped id.
 *
 * The picture is a sample and says so: the seed labels the guest it belongs to
 * (lib/event-cm/seed.ts). A face is the one guessed value a viewer cannot tell
 * is guessed by looking at it.
 */
export const templatePortrait = (assetId: string | undefined): DefaultAsset | null => {
  if (!assetId) return null;
  const asset = assetById(assetId);
  return asset?.kind === "portrait" ? asset : null;
};

/** Defaults that may not be published — the publish warning lists these. */
export const unlicensedDefaults = (srcs: readonly string[]): DefaultAsset[] =>
  DEFAULT_ASSETS.filter((asset) => !asset.licensed && srcs.includes(asset.src));

/**
 * The levelling multiplier for a pool file, by the src a brief holds.
 *
 * A brief points at `defaults/bgm/x.mp3`, not at a pool id, so the lookup is by
 * path. An unmeasured or unknown file returns 1: a missing measurement must not
 * silence a track that was playing.
 */
export const poolGain = (src: string | null | undefined): number => {
  if (!src) return 1;
  const asset = DEFAULT_ASSETS.find((entry) => entry.src === src);
  // Measured, then adjusted by ear. Two numbers rather than one so that
  // re-running scripts/measure-default-bgm.mjs can rewrite `gain` without
  // silently discarding somebody's listening (`gainAdjustDb`).
  const adjust = asset?.gainAdjustDb ?? 0;
  return (asset?.gain ?? 1) * 10 ** (adjust / 20);
};

/**
 * How a pool track is played: where it starts, and how long one pass lasts.
 *
 * Same lookup shape as `poolGain`, same reason: the brief holds a src, not a
 * pool id. Unknown or user-supplied files start at 0 and report no loop length
 * — their arrangement is their owner's, and the composition falls back to the
 * plain `loop` that approved films already use.
 *
 * **A trim without a measured duration is dropped.** The two travel together
 * because a trimmed track can only be looped by a loop of known length; an
 * unlooped trim runs out mid-film, which is worse than a thin intro.
 */
export const poolPlayback = (
  src: string | null | undefined,
): { startFromSec: number; loopSec: number } => {
  const asset = src ? DEFAULT_ASSETS.find((entry) => entry.src === src) : undefined;
  const startFromSec = asset?.startFromSec ?? 0;
  const durationSec = asset?.durationSec ?? 0;
  // A measured length is enough. This used to also require a trim, which tied
  // the explicit loop to the edit that happened to need one — so removing the
  // trim from bright-corporate (2026-08-30) would have handed the standard film
  // straight back to Remotion's `loop`, the path that plays 40 seconds and then
  // nothing in the browser Player. Knowing the length is what lets the loop be
  // stated; whether the head is skipped is a separate question.
  if (durationSec <= startFromSec) return { startFromSec: 0, loopSec: 0 };
  return { startFromSec, loopSec: durationSec - startFromSec };
};
