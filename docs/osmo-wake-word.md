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

## If he wakes too often, or not enough

- **Wakes by mistake** (TV, conversation): first raise `threshold` in `lib/voice/wake.ts` (0.7 → 0.8). If that isn't enough, train again with the phrase "hey osmo" — set `config["target_phrase"] = ["hey osmo"]` and `config["model_name"] = "hey_osmo"` — which wakes by mistake far less. The downloaded file is `hey_osmo.onnx`; rename it to `osmo.onnx` before giving it to Claude. Claude must also regenerate the voice-check clips to say "Hey Osmo" (they currently say "Osmo.").
- **Doesn't wake when you say it:** lower `threshold` a little (0.7 → 0.6), or train again with `n_samples` at 10000.
