# Transcription accuracy: independent benchmark

This is a local comparison of an ASR transcript against a HUMAN-VERIFIED reference transcript. It is not a new speech recognizer. It has no network requests, uploads, or inference costs.

## Benchmark the five-minute sample

1. Keep sample-speech-5m.mp3 and reference.txt outside the public repo. Do not commit users' recordings or transcripts to GitHub or CI artifacts.
2. Manually verify reference.txt against the COMPLETE audio. A previous ASR guess is not a ground truth.
3. Export ZAIF's output to hypothesis.txt.
4. From the repository root run this command, replacing the paths:

    node scripts/compare-transcripts.mjs --reference /path/to/reference.txt --hypothesis /path/to/hypothesis.txt

Add --json for machine-readable metrics. Add --max-wer 0.15 to fail when WER exceeds 15%, but first measure the baseline; there is no claim that 15% is currently achievable.

WER = (substitutions + deletions + insertions) / number of reference words. WER may exceed 100%. The report also shows missing-alignment candidates and repeated phrase candidates. Neither proves which audio segment is wrong: a real speaker may repeat words, and alignment is approximate for severely broken transcripts. Punctuation, diarization, punctuation quality and timestamp accuracy are NOT scored.

## Test checklist for the Codex engine workstream

- A clear 20-second English sample preserves the first and last words.
- The 5-minute sample covers speech from the beginning through the end without missing middle paragraphs.
- Overlapping audio windows do not create duplicate text, but genuinely repeated speech remains repeated.
- Silence does not create unrelated hallucinated paragraphs.
- Cancel, retry, and failed model load leave controls usable and do not destroy saved audio.
- CPU/RAM, model load time and package sizes are measured for Tiny English and opt-in Base English; Whisper never runs merely because a call starts.
- The final output is always compared against a verified reference using the CLI above; report WER, insertions, substitutions, deletions, and observed omissions/repetitions.

## Parallel branch ownership

ChatGPT owns only the independent benchmark files:
- scripts/transcript-quality.mjs
- scripts/transcript-quality.test.mjs
- scripts/compare-transcripts.mjs
- docs/transcription-accuracy.md
- .github/workflows/transcript-quality.yml

Codex should modify the actual Whisper/chunking runtime, optional model packaging and transcription UI on a DIFFERENT branch, starting from main after this benchmark is merged. It should avoid the benchmark files to prevent conflicts. No private recording should be committed without permission.

This comparison is deterministic and does not independently evaluate audio; it cannot prove that the extension is transcription-accurate until validated with real files in Chrome.
