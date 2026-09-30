# Training Osmo's wake word

Osmo's ear for his name is a small file, `osmo.onnx`, that you train once with openWakeWord's free notebook on Google Colab. It takes about 1–2 hours, mostly waiting. Until it exists, the mic button works and "Listen for 'Osmo'" stays off.

## What you need

- A Google account (for Colab).
- About 2 hours in which you can leave the browser tab open.

## Steps

1. Open https://colab.research.google.com/github/dscripka/openWakeWord/blob/main/notebooks/automatic_model_training.ipynb
2. **Runtime → Change runtime type → T4 GPU → Save.**
3. Run the first code cell ("Environment setup"): press its play button and wait for it to finish (5–10 minutes). If Colab asks to restart the session, restart it, then carry on from the next cell.
4. Run the "Imports" cell and the three "Download" cells in order (about 15 minutes in all).
5. In the cell that begins `# Modify values in the config and save a new version`, change the first lines so they read:

       config["target_phrase"] = ["osmo"]
       config["model_name"] = "osmo"
       config["custom_negative_phrases"] = ["cosmo", "awesome", "also", "gizmo", "osmosis", "almost"]
       config["n_samples"] = 5000
       config["n_samples_val"] = 1000
       config["steps"] = 20000
       config["max_negative_weight"] = 3000
       config["target_false_positives_per_hour"] = 0.1

   Leave the other lines in that cell as they are, then run it.
6. Run "Step 1: Generate synthetic clips" (the longest part, about 45–60 minutes). If it stops, run it again; it continues where it left off.
7. Run "Step 2: Augment the generated clips", then "Step 3: Train model" (about 20–40 minutes together).
8. In the file browser on the left (the folder icon), open `my_custom_model`, right-click `osmo.onnx` and choose **Download**. Skip step 4 of the notebook (tflite); Osmo uses the `.onnx` file.
9. Give the file to Claude in this project. It goes to `public/models/wake/osmo.onnx`. Claude then runs `npm run voice:check`, which now tests "Osmo" itself, and commits it. It goes live with the next push.

## What it took on 2026-09-30 (read this before training again)

The notebook is a year behind Colab. Trained once this way; the model is `public/models/wake/osmo.onnx`.

1. **Runtime version 2025.07**, not "Latest" (Runtime → Change runtime type → Runtime version). Latest is Python 3.13, and `piper-phonemize` and `speexdsp-ns` have no build for it, so the setup half-fails. Also check the accelerator really is T4 GPU: it silently fell back to CPU once.
2. After the setup cell asks to **restart the session**, run from the Imports cell down (Run all stops at the restart).
3. Put these lines at the top of the **Step 1** cell:

       !git -C piper-sample-generator checkout -q 195e3bd967 && ls piper-sample-generator/generate_samples.py
       %env TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD=1
       !mkdir -p openwakeword/openwakeword/resources && wget -q -O openwakeword/openwakeword/resources/en_us_cmudict_forward.pt https://huggingface.co/NRC-CNRC/en_us_cmudict_ipa_forward_g2p/resolve/main/en_us_cmudict_forward.pt
       import io, zipfile; p = "openwakeword/openwakeword/resources/en_us_cmudict_forward.pt"; d = open(p, "rb").read(); zin = zipfile.ZipFile(io.BytesIO(d)); buf = io.BytesIO(); zout = zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED); [zout.writestr(i, zin.read(i.filename).replace(b"deep_phonemizer.", b"dp.")) for i in zin.infolist()]; zout.close(); open(p, "wb").write(buf.getvalue())

   Why: piper-sample-generator moved `generate_samples.py` into a package in March 2026 (v2.0.0 matches the model the notebook downloads); torch 2.6+ refuses that version's `torch.load` without the flag; the phonemizer checkpoint's S3 link is dead and the Hugging Face mirror renamed the module inside it.
4. Put this at the top of the **Step 3** cell, or training is OOM-killed (exit 137) at the start of its second sequence:

       !sed -i 's/num_workers=n_cpus, prefetch_factor=16/num_workers=0/' openwakeword/openwakeword/train.py

   Running it with `nohup … > train3.log 2>&1 &` and polling `tail train3.log` in another cell keeps a stray interrupt from killing it. Training is about 13 minutes on a T4.
5. If a step was interrupted, delete `my_custom_model/osmo/*_features_*.npy` before rerunning Step 2, or it says the features "already exist" and Step 3 fails on a missing file.
6. Step 4 (tflite) fails on an `onnx` import; ignore it. `osmo.onnx` is in `my_custom_model/`, and `from google.colab import files; files.download("my_custom_model/osmo.onnx")` fetches it.

## If he wakes too often, or not enough

- **Wakes by mistake** (TV, conversation): first raise `threshold` in `lib/voice/wake.ts` (0.7 → 0.8). If that isn't enough, train again with the phrase "hey osmo" — set `config["target_phrase"] = ["hey osmo"]` and `config["model_name"] = "hey_osmo"` — which wakes by mistake far less. The downloaded file is `hey_osmo.onnx`; rename it to `osmo.onnx` before giving it to Claude. Claude must also regenerate the voice-check clips to say "Hey Osmo" (they currently say "Osmo.").
- **Doesn't wake when you say it:** lower `threshold` a little (0.7 → 0.6), or train again with `n_samples` at 10000.
