/** Independent, local-only transcript quality measurements. Not an ASR engine. */
export function wordsOf(text) {
  if (typeof text !== 'string') throw new TypeError('Transcript text must be a string.');
  return text.normalize('NFKC').toLocaleLowerCase('en-US')
    .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
}

/** A repeated phrase is a review candidate, not proof that the audio didn't repeat. */
export function repeatedPhraseCandidates(words, { minWords = 7, maxWords = 16, limit = 6 } = {}) {
  if (!Array.isArray(words)) throw new TypeError('Expected token array.');
  if (!Number.isInteger(minWords) || minWords < 2) throw new RangeError('minWords must be at least 2.');
  const results = [], occupied = [];
  const max = Math.min(maxWords, Math.floor(words.length / 2));
  for (let length = max; length >= minWords && results.length < limit; length--) {
    const seen = new Map();
    for (let i = 0; i <= words.length - length && results.length < limit; i++) {
      const key = words.slice(i, i + length).join(' ');
      const previous = seen.get(key);
      if (previous !== undefined && i >= previous + length) {
        const overlaps = occupied.some(([s,e]) =>
          (previous < e && previous + length > s) || (i < e && i + length > s));
        if (!overlaps) {
          results.push({ phrase: key, words: length, firstWordIndex: previous, repeatWordIndex: i });
          occupied.push([previous, previous + length], [i, i + length]);
        }
      } else if (previous === undefined) seen.set(key, i);
    }
  }
  return results.sort((a,b) => a.firstWordIndex - b.firstWordIndex);
}

const MAX_ALIGNMENT_CELLS = 12_000_000;
const at = (row, col, cols) => row * cols + col;

/** Exact edit-distance alignment: WER = (substitutions + deletions + insertions) / reference words.
 * Limit matrix size to avoid consuming large amounts of memory in Node.
 */
export function compareTranscripts(reference, hypothesis) {
  const ref = wordsOf(reference), hyp = wordsOf(hypothesis);
  if (!ref.length) throw new Error('Reference transcript is empty after normalization. Provide a verified human reference.');
  const rows = ref.length + 1, cols = hyp.length + 1;
  if (rows * cols > MAX_ALIGNMENT_CELLS) {
    throw new Error('Comparison is too large (' + ref.length + ' × ' + hyp.length +
      ' words). Split the files into shorter verified sections.');
  }
  const matrix = new Uint32Array(rows * cols);
  for (let i = 0; i < rows; i++) matrix[at(i,0,cols)] = i;
  for (let j = 0; j < cols; j++) matrix[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const diag = matrix[at(i-1,j-1,cols)] + (ref[i-1] === hyp[j-1] ? 0 : 1);
      const del = matrix[at(i-1,j,cols)] + 1;
      const ins = matrix[at(i,j-1,cols)] + 1;
      matrix[at(i,j,cols)] = Math.min(diag, del, ins);
    }
  }
  const operations = [];
  let i = ref.length, j = hyp.length;
  while (i || j) {
    const value = matrix[at(i,j,cols)];
    if (i && j && ref[i-1] === hyp[j-1] && value === matrix[at(i-1,j-1,cols)]) {
      operations.push({type:'correct', reference: ref[--i], hypothesis: hyp[--j]});
    } else if (i && j && value === matrix[at(i-1,j-1,cols)] + 1) {
      operations.push({type:'substitution', reference: ref[--i], hypothesis: hyp[--j]});
    } else if (i && value === matrix[at(i-1,j,cols)] + 1) {
      operations.push({type:'deletion', reference: ref[--i]});
    } else if (j && value === matrix[at(i,j-1,cols)] + 1) {
      operations.push({type:'insertion', hypothesis: hyp[--j]});
    } else throw new Error('Unexpected alignment state.');
  }
  operations.reverse();
  const counts = {correct:0, substitutions:0, deletions:0, insertions:0};
  const keys = {correct:'correct', substitution:'substitutions', deletion:'deletions', insertion:'insertions'};
  for (const op of operations) counts[keys[op.type]]++;
  const missingReferenceSpans = [];
  let deleted = [], position = 0;
  for (const op of [...operations, {type:'end'}]) {
    if (op.type === 'deletion') {
      if (!deleted.length) deleted.start = position;
      deleted.push(op.reference);
    } else if (deleted.length) {
      if (deleted.length >= 4) missingReferenceSpans.push({
        startWordIndex: deleted.start, words: deleted.length,
        excerpt: deleted.slice(0, 40).join(' ')
      });
      deleted = [];
    }
    if (op.reference) position++;
  }
  missingReferenceSpans.sort((a,b)=>b.words-a.words);
  const errors = counts.substitutions + counts.deletions + counts.insertions;
  const wer = errors / ref.length;
  return {
    referenceWords: ref.length, hypothesisWords: hyp.length, ...counts,
    wordErrorRate: Number(wer.toFixed(5)),
    wordErrorRatePercent: Number((100 * wer).toFixed(2)),
    exactReferenceWordMatchPercent: Number((100 * counts.correct / ref.length).toFixed(2)),
    missingReferenceSpans: missingReferenceSpans.slice(0, 8),
    repeatedPhraseCandidates: repeatedPhraseCandidates(hyp),
    caveats: [
      'WER requires an independently verified reference transcript, not another ASR guess.',
      'Repeated phrases are review candidates, not automatically transcription errors.',
      'Word alignment is not audio verification; inspect the recording before assigning a cause.',
      'Punctuation, timestamps, speaker labels, and equivalent ways of writing numbers are not measured.'
    ]
  };
}
