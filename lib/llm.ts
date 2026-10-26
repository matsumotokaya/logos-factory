import { LengthFinishReasonError } from "openai/error";

// How much room a model call is given, and what to say when it runs out.
//
// One place, because the number is a policy rather than a per-call opinion.
//
// WHAT THE BUDGET COVERS: `max_completion_tokens` caps the COMPLETION —
// reasoning plus the answer — and not the prompt. A call can read a hundred
// thousand tokens of flyers under a budget of thirty thousand; what it may not
// do is think and write more than thirty thousand. On a reasoning model most
// of a budget goes to the thinking, which is why these numbers are far larger
// than the answers they carry (a narration measures ~2,400, a Brand Kit ~4,000).
//
// WHY IT IS CAPPED AT ALL: a ceiling is not a reservation — nothing is billed
// for room left unused — so a generous limit costs nothing on an ordinary run.
// It costs on a pathological one: a model that starts repeating itself will
// spend every token it is allowed. The cap is what stops one confused call from
// running up a bill, so it stays finite.
//
// WHY THEY ARE THIS LARGE: the first version of the narration call allowed 4,000
// against a typical spend of 2,352. That is not a limit that fails — it is one
// that fails SOMETIMES, which is worse, because a stage that usually works and
// occasionally dies of an English sentence about a length limit reads as
// corrupted data rather than as an exceeded size.

/**
 * Which model does the reading, the writing and the judging.
 *
 * One place, for the same reason as the budget below: it is a policy, not a
 * per-call opinion. It was four — the brand-source inspector, the Brand Kit,
 * the event reader and the narration writer each declared the same string —
 * and raising the model meant finding all four. Missing one does not fail: the
 * stages simply run on different models and the run log says so in a line
 * nobody reads.
 *
 * `LLM_ENGINE` is the sentence a run's log shows a user, so it is derived here
 * rather than written out again.
 */
export const LLM_MODEL = "gpt-5.6-luna";
export const LLM_PROVIDER = "OpenAI API";
export const LLM_ENGINE = `OpenAI API（Chat Completions + structured outputs / ${LLM_MODEL}）`;

export const LLM_BUDGET = {
  /**
   * Reasoning plus a structured answer of real size: reading a stack of
   * documents, writing a narration, assembling a Brand Kit.
   */
  long: 30_000,
  /**
   * Reasoning plus a small structured answer: a verdict, a classification, a
   * palette assignment. Still far above the answer, for the same reason.
   */
  short: 8_000,
} as const;

/**
 * Run a structured-output call, and translate one failure.
 *
 * A call that exhausts its budget throws `LengthFinishReasonError`, whose
 * message is "Could not parse response content as the length limit was
 * reached". That sentence reached a user's run log verbatim and told them
 * nothing: not which limit, not why this take hit it, not what to do — and it
 * reads like a broken tool rather than a job that outgrew its budget. The guess
 * it invited (that editing while building had corrupted the video, and starting
 * over would help) was wrong: the same documents hit the same wall.
 *
 * Only this one. Everything else — a timeout, a 500, a refusal — passes through
 * untouched, because translating every failure into one sentence would make
 * every failure look like the same failure.
 */
export async function parseOrExplain<T>(
  call: () => Promise<T>,
  explanation: string,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof LengthFinishReasonError) throw new Error(explanation);
    throw error;
  }
}
