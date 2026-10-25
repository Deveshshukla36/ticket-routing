# Training RoBERTa locally (RTX 3050) and publishing it to Hugging Face

This trains the RoBERTa intent model on your own GPU, measures it on the independent
holdout, and uploads it to the Hugging Face Hub. Connecting the API and the dashboard
to it is a separate step and isn't covered here.

Commands are for **PowerShell** on Windows, run from the repo root.

## How the evaluation stays honest

| Set | Source | Used for |
|---|---|---|
| Train | `backend/data/tickets_dataset.csv` minus the validation templates (768 rows, 96 templates) | fitting the weights |
| Validation | 24 whole templates held out of training, 3 per intent (141 sentences) | choosing the best epoch (lowest validation loss) |
| Holdout | `backend/data/holdout.json`, 200 hand-written tickets | the single reported accuracy, measured once after training |

Validation shares no template and no sentence with training, so the checkpoint is chosen
by how well the model handles phrasing it hasn't seen. The holdout is never used for
training, checkpoint selection or early stopping. The CI tests in
`backend/tests/test_training_data.py` check all of this.

**One rule while experimenting:** tune hyperparameters by the **validation** numbers,
not the holdout. If you change settings and rerun until the holdout number looks good,
the holdout stops being independent.

## 1. Install the GPU build of PyTorch

Check the driver first:

```powershell
nvidia-smi
```

Your `.venv` currently has the CPU-only build of torch. Replace it with the CUDA 12.6
build; it works with any recent NVIDIA driver:

```powershell
.venv\Scripts\python.exe -m pip uninstall -y torch
.venv\Scripts\python.exe -m pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cu126
.venv\Scripts\python.exe -m pip install -r requirements-ml.txt
```

Confirm the GPU is visible. This should print `True NVIDIA GeForce RTX 3050 ...`:

```powershell
.venv\Scripts\python.exe -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

## 2. Dry run (no download, no training)

This checks the data and the splits, and that the holdout is independent of training:

```powershell
.venv\Scripts\python.exe backend\train_transformer.py --dry-run
```

## 3. Train

```powershell
.venv\Scripts\python.exe backend\train_transformer.py
```

- **First run:** it downloads `roberta-base` (about 500 MB) from the Hugging Face Hub;
  later runs reuse the cache.
- **Defaults:** up to 10 epochs, batch size 16, learning rate 2e-5, fp16 on the GPU,
  early stopping after 3 epochs without a lower validation loss. On an RTX 3050 expect
  a few minutes.
- **Out of GPU memory (`CUDA out of memory`):** add `--batch-size 8`.
- **Smaller, faster model:** add `--model-name distilroberta-base`.
- **All options:** run it with `--help`.

At the end it prints the holdout confusion matrix and writes everything to
`backend/models/roberta-intent-classifier/`:

| File | What it is |
|---|---|
| `model.safetensors`, `config.json` | the weights and the label mapping (`id2label`) |
| tokenizer files | needed to run the model |
| `metrics.json` | holdout accuracy, F1, per-intent scores, confusion matrix, the validation result, the split, hyperparameters, device, git commit |

`.gitignore` excludes this folder and `backend/checkpoints/`, so the weights won't be
committed by accident.

## 4. Read the result

Open `backend/models/roberta-intent-classifier/metrics.json` and look at
`holdout.accuracy`. The project gate for RoBERTa is **0.92**. Report the number either
way. If it falls short, the honest levers are:
- different hyperparameters, chosen by **validation** loss and accuracy;
- more varied training data (more templates in `backend/data/generate_dataset.py`).

## 5. Get your Hugging Face tokens and pick a model ID

1. Create a free account at <https://huggingface.co/join>.
2. Go to **Settings → Access Tokens** (<https://huggingface.co/settings/tokens>) and create
   two tokens:
   - **Write** token: used only on your machine, to upload the model.
   - **Read** token: used later by the API (Render) and CI. It's the `HF_API_TOKEN`
     in the README.
3. Your model ID is `<your-username>/roberta-intent-8class`. This is `HF_MODEL_ID`.

Treat tokens like passwords. Keep them in environment variables or the Hugging Face
login cache, never in a file in this repo, a commit, or a chat message.

## 6. Upload

Set the write token for this PowerShell session only. Alternatively, run
`.venv\Scripts\hf.exe auth login`, which stores it in your user profile instead.

```powershell
$env:HF_TOKEN = [System.Net.NetworkCredential]::new('', (Read-Host "Paste your Hugging Face WRITE token" -AsSecureString)).Password
$env:HF_MODEL_ID = "<your-username>/roberta-intent-8class"
```

The token prompt hides what you type, and this form works in both Windows PowerShell 5.1
and PowerShell 7.

Check the folder and generate the model card, without uploading:

```powershell
.venv\Scripts\python.exe scripts\push_to_hub.py --dry-run
```

Upload:

```powershell
.venv\Scripts\python.exe scripts\push_to_hub.py
```

The script:
- refuses to upload if files are missing, `metrics.json` is absent, or the label order
  differs from what the API expects;
- creates the repo (public by default; add `--private` for a private one);
- uploads the weights, tokenizer, `metrics.json`, and a `README.md` model card generated
  from the measured numbers. The card states the synthetic training data and whether
  the 92% gate was met.

Clear the token from the session when you're done:

```powershell
Remove-Item Env:HF_TOKEN
```

## 7. Next step (not covered here)

Connecting the API to the model is the next PR:
- setting `MODEL_BACKEND=roberta`, `HF_MODEL_ID` and the **read** token on Render;
- adding the same token and model ID to GitHub so the CI RoBERTa gate runs;
- checking whether Hugging Face's serverless route serves the model (see the hosting
  risk in [ADR 001](adr/001-roberta-serving.md)).
