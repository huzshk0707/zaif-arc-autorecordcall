#!/usr/bin/env node
/* Local-only transcript quality CLI; no dependencies, model, audio uploads or network. */
import fs from 'node:fs/promises';
import { compareTranscripts } from './transcript-quality.mjs';
const usage = () =>
  'Usage: node scripts/compare-transcripts.mjs --reference REFERENCE.txt --hypothesis ZAIF.txt [--json] [--max-wer 0.15]\n' +
  '--max-wer is an optional decimal threshold (e.g. 0.15 means 15% WER).\n' +
  'The reference must be independently checked against the audio.';
function parse(argv) {
  const args = {json:false, maxWer:null};
  for (let i=0; i<argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { args.help=true; continue; }
    if (arg === '--json') { args.json=true; continue; }
    if (['--reference','--hypothesis','--max-wer'].includes(arg)) {
      if (!argv[i+1] || argv[i+1].startsWith('--')) throw Error('Missing value for ' + arg);
      const value = argv[++i];
      if (arg === '--reference') args.reference = value;
      if (arg === '--hypothesis') args.hypothesis = value;
      if (arg === '--max-wer') {
        args.maxWer = Number(value);
        if (!Number.isFinite(args.maxWer) || args.maxWer < 0 || args.maxWer > 1)
          throw Error('--max-wer must be between 0 and 1.');
      }
    } else throw Error('Unknown option: ' + arg);
  }
  if (!args.help && (!args.reference || !args.hypothesis)) throw Error('Both --reference and --hypothesis are required.');
  return args;
}
function report(r) {
  const lines = [
    'ZAIF ARC — offline transcription quality',
    'Reference words: ' + r.referenceWords + ' | Hypothesis words: ' + r.hypothesisWords,
    'WER: ' + r.wordErrorRatePercent + '%' + (r.wordErrorRate > 1 ? ' (may exceed 100% with insertions)' : ''),
    'Correct: ' + r.correct + ', substitutions: ' + r.substitutions +
      ', deletions: ' + r.deletions + ', insertions: ' + r.insertions,
    'Reference words matched: ' + r.exactReferenceWordMatchPercent + '%',
    '',
    'Long reference spans missing from transcript (candidates only):'
  ];
  if (!r.missingReferenceSpans.length) lines.push('  None detected with 4+ consecutive missing words.');
  for (const span of r.missingReferenceSpans) lines.push('  - ' + span.words +
    ' words near reference word #' + (span.startWordIndex+1) + ': ' + span.excerpt);
  lines.push('', 'Repeated phrases in output (may be genuine audio repetition):');
  if (!r.repeatedPhraseCandidates.length) lines.push('  None detected with 7+ repeated words.');
  for (const span of r.repeatedPhraseCandidates) lines.push('  - ' + span.words +
    ' words at output words #' + (span.firstWordIndex+1) + ', #' +
    (span.repeatWordIndex+1) + ': ' + span.phrase);
  lines.push('', ...r.caveats.map(x=>'Note: '+x));
  return lines.join('\n');
}
let args;
try { args = parse(process.argv.slice(2)); }
catch (error) { console.error(error.message + '\n\n' + usage()); process.exitCode=2; }
if (args?.help) console.log(usage());
else if (args) {
  try {
    const [reference,hypothesis] = await Promise.all([
      fs.readFile(args.reference,'utf8'), fs.readFile(args.hypothesis,'utf8')
    ]);
    const r = compareTranscripts(reference,hypothesis);
    console.log(args.json ? JSON.stringify(r,null,2) : report(r));
    if (args.maxWer !== null && r.wordErrorRate > args.maxWer) process.exitCode=1;
  } catch (error) {
    console.error('Transcript benchmark failed: ' + error.message);
    process.exitCode=2;
  }
}
