// Saying what went wrong with the recording, in the words the user wrote in.
//
// The provider answers a quota failure with a paragraph of English and a JSON
// body, and the two limits it enforces mean completely different things to
// whoever is waiting:
//
//   per minute  clears by itself. The synthesiser reads the delay the provider
//               states and carries on (lib/voice/tts-lib/tts.mjs
//               `retryDelayMs`), so this only reaches a person when waiting did
//               not help.
//   per day     does not clear until tomorrow. Waiting inside a run cannot fix
//               it, and the body says to wait ~60s anyway, because that is when
//               the MINUTE window reopens.
//
// Reporting both as 429 leaves somebody watching a bar for a limit that has
// already been reached for the day. The numbers are not written here: they
// depend on the tier the key is on, and this project moved off the free tier on
// 2026-08-29. What does not depend on the tier is which of the two was hit.
// Not `server-only`: naming the fix is not a privileged act, and the screen may
// want to say it without a round trip.

/** The provider's sentence, translated into what to do about it. */
export function explainTtsError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (/PerDay/i.test(raw)) {
    return (
      "Gemini の1日あたりの上限に達しました。読み上げは1本の動画でシーンの数だけ" +
      "使います（イベント紹介動画は7回）。待っても今日は解除されないので、" +
      "Google AI Studio でこのプロジェクトの請求先と割り当てを確認してください。" +
      "急ぐ場合は TTS_MOCK=1 で仮の音声を使えます"
    );
  }

  if (/RESOURCE_EXHAUSTED|\b429\b/.test(raw)) {
    return (
      "Gemini の1分あたりの上限に達しました。通常は指定された時間だけ自動で待って" +
      "続行しますが、待っても戻らなかったようです。少し置いてやり直してください"
    );
  }

  if (/GEMINI_API_KEY/.test(raw)) {
    return (
      "GEMINI_API_KEY が設定されていません。リポジトリ直下の .env に入れるか、" +
      "TTS_MOCK=1 で仮の音声を使ってください"
    );
  }

  return `読み上げに失敗しました: ${raw}`;
}
