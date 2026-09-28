# Osmo's voice models

Everything runs on the device, with `onnxruntime-web` 1.30.0 served from Osmo's own site (`public/ort`, copied from `node_modules` by `scripts/copy-ort.mjs`).

**`public/models/speaker/campplus-en.onnx`**
- Turns a voice into a voiceprint (512 numbers).
- Source: 3D-Speaker CAM++, `iic/speech_campplus_sv_en_voxceleb_16k`, as exported by sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx
- License: Apache-2.0 (3D-Speaker).

**`public/models/wake/melspectrogram.onnx`**
- Turns audio into the detector's features.
- Source: openWakeWord v0.5.1 release.
- License: Apache-2.0.

**`public/models/wake/embedding_model.onnx`**
- Speech embeddings for the detector (Google's speech embedding).
- Source: openWakeWord v0.5.1 release.
- License: Apache-2.0.

**`public/models/wake/osmo.onnx`**
- Hears "Osmo".
- Source: trained by Gur with openWakeWord's notebook (`docs/osmo-wake-word.md`).
- License: Gur's.

openWakeWord's own pre-trained wake words (such as `hey_jarvis`, CC BY-NC-SA 4.0) are used only by the voice check, from the git-ignored `scripts/voice-clips/`. They are never served.

## The check

Speaker model input: 80-bin Kaldi-style fbank (`lib/voice/fbank.ts`) of 16 kHz samples on the -1..1 scale, with each bin's mean subtracted; tensor `x` is `[1, frames, 80]`. Output: `embedding`, `[1, 512]`.

Planning run on 2026-09-27, with the Windows voices David, Mark and Zira (a 4-reading voiceprint against a 5th reading):
- the same voice scored 0.92–0.93;
- different voices scored at most 0.38;
- each judgement took about 0.25 s.

The repeatable check (`npm run voice:check`, below) gave the same voice 0.91–0.92, and different voices at most 0.41.

Across both runs, the same voice scored 0.91–0.93, and different voices at most 0.41. `MATCH_THRESHOLD` (0.5) and `READING_AGREEMENT` (0.5) in `lib/voice/voiceprint.ts` start from these numbers. Tune them after real-voice checks.

To run it again:

    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/voice-clips.ps1
    npm run voice:check

Once `public/models/wake/osmo.onnx` exists, the check tests it on "Osmo." in all three voices instead of the stand-in "hey jarvis".
