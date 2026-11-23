import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTranscripts, repeatedPhraseCandidates, wordsOf } from './transcript-quality.mjs';

test('normalizes punctuation and casing', () => {
  assert.deepEqual(wordsOf(' Hello, WORLD! Isn’t this — 120? '), ['hello','world','isn’t','this','120']);
  const result = compareTranscripts('Hello world!', 'HELLO WORLD');
  assert.equal(result.correct, 2);
  assert.equal(result.wordErrorRate, 0);
});
test('counts substitutions and deletions', () => {
  const r = compareTranscripts('the quick brown fox jumps over the lazy dog', 'the quick fox jumps over a lazy dog');
  assert.equal(r.referenceWords, 9);
  assert.equal(r.hypothesisWords, 8);
  assert.equal(r.deletions, 1);
  assert.equal(r.substitutions, 1);
  assert.equal(r.insertions, 0);
  assert.equal(r.correct, 7);
  assert.equal(r.wordErrorRate, 0.22222);
});
test('counts inserted words separately', () => {
  const r = compareTranscripts('hello world', 'hello and world again');
  assert.equal(r.insertions, 2);
  assert.equal(r.deletions, 0);
  assert.equal(r.wordErrorRate, 1);
});
test('WER may exceed 100%; empty output is a deletion', () => {
  assert.equal(compareTranscripts('one two three', '').deletions, 3);
  assert.equal(compareTranscripts('hello', 'hello hello hello').wordErrorRate, 2);
});
test('detects repeated text as a review candidate', () => {
  const sentence = 'images are perhaps the most fundamental type of digital media';
  const result = repeatedPhraseCandidates(wordsOf(sentence + ' extra connecting text ' + sentence));
  assert.ok(result.length);
  assert.match(result[0].phrase, /images are perhaps/);
});
test('identifies long omitted reference spans', () => {
  const r = compareTranscripts('start one two three four five six seven eight nine ten finish','start finish');
  assert.ok(r.missingReferenceSpans.some(span => span.words >= 10));
});
test('rejects empty references and unsafe large alignments', () => {
  assert.throws(() => compareTranscripts(' ', 'something'), /Reference transcript is empty/);
  assert.throws(() => compareTranscripts('word '.repeat(5000), 'word '.repeat(5000)), /Split the files/);
});
