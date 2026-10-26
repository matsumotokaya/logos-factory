// The retry policy for text-to-speech, which is a rule about a quota rather
// than a preference about waiting.
//
// It regressed silently once: a fixed 1.5s/3.0s backoff spent both retries
// inside the same one-minute window, so a seven-scene film failed on a limit
// that clears by itself. The provider states the wait it wants; these tests
// say that the stated wait is what happens, and that a daily quota -- which
// states the same ~60s because that is when the MINUTE window reopens -- is
// not waited on at all.

import assert from "node:assert/strict";
import test from "node:test";
import { retryDelayMs } from "./tts-lib/tts.mjs";

const quota = (body: string) => new Error(body);

test("waits the delay the provider asked for", () => {
  const err = quota('{"@type":"...RetryInfo","retryDelay":"57s"}');
  assert.equal(retryDelayMs(err, 0), 57_500);
});

test("never waits less than the old backoff", () => {
  // A sub-second delay is still a failure worth pausing on, and the backoff is
  // the floor that non-quota failures (a blocked response) rely on.
  const err = quota('{"retryDelay":"0.2s"}');
  assert.equal(retryDelayMs(err, 1), 3000);
});

test("caps a hostile or malformed delay", () => {
  const err = quota('{"retryDelay":"86400s"}');
  assert.equal(retryDelayMs(err, 0), 90_000);
});

test("falls back to the backoff when nothing is stated", () => {
  assert.equal(retryDelayMs(new Error("socket hang up"), 0), 1500);
  assert.equal(retryDelayMs(new Error("socket hang up"), 1), 3000);
});

test("does not retry a daily quota", () => {
  // The body carries a RetryInfo of about a minute anyway. Obeying it spends
  // two minutes to fail: the allowance is gone until tomorrow.
  const err = quota(
    '429 RESOURCE_EXHAUSTED {"violations":[{"quotaId":"GenerateContentPaidTierInputTokensPerDay"}],"retryDelay":"58s"}',
  );
  assert.equal(retryDelayMs(err, 0), null);
});
