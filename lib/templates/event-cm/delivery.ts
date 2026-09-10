// How the narrator reads an event announcement.
//
// The words are written elsewhere (narration.ts); this is the delivery, and it is
// a template-level opinion rather than a per-take setting. An announcement is
// read by somebody who is glad the thing is happening and expects you to come
// — which is not the same as a hard sell, and not the same as a measured
// documentary read either.
//
// The first version asked for 「落ち着いた語り口／抑揚は控えめ／言葉のあいだを丁寧に」
// and got exactly that: correct, well-timed, and too slow for a thirty-second
// spot. The pauses the template already builds between chapters
// (EVENT_CM_SCENE_GAP_MS) supply the breathing room, so the reading itself does
// not need to add any — asking for both produced a narrator waiting twice.
//
// What is explicitly ruled out is the failure mode on the other side: an
// over-performed announcer voice. A rising tail on every line, a smiling
// delivery, stretched vowels — those read as an advertisement performing
// enthusiasm rather than a host who has news.
export const EVENT_CM_PERSONA = [
  "イベント告知のナレーター。",
  "少し速めの一定テンポで、歯切れよく前に進めて読み上げます。",
  "自分が案内する催しを楽しみにしている人の張りのある声。",
  "ただし大げさに煽らない: 語尾を伸ばさない、語尾を上げない、作った明るさや過剰な抑揚をつけない。",
  "文のあいだで長く止まらない（間はこちらで設計済み）。",
].join("");
