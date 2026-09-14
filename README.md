# ESOPT — Epilepsy Surgery Outcome Prognostication Tool

A static, client-side web calculator implementing the hierarchical multimodal
ensemble model described in:

> Thomas, J., Abdallah, C., Aung, T., Bosque-Varela, P., Doležalová, I.,
> Parikh, P., Wadi, L., Jaber, K., Cai, Z., Ho, A. and Moye, M.K., 2026.
> Hierarchical integration of multimodal clinical data to predict epilepsy
> surgery outcome. *medRxiv*, pp.2026-05.
> https://www.medrxiv.org/content/10.64898/2026.05.05.26352481v1
>
> **Please cite this manuscript if you use this tool, its methodology, or its results.**

**Live scope of this build:** Mesial Temporal Lobe Epilepsy (MTLE), 4
modalities, 10 features. Built to scale to additional epilepsy types and
modalities without a rewrite (see [Scaling up](#scaling-up)).

> ⚠️ **Research tool, not a diagnostic device.** Scores are produced by the
> linear-SVM ensemble in [`js/model_weights.js`](js/model_weights.js), trained
> on a research cohort (see manuscript for validation performance). This tool
> has not been independently, prospectively validated for clinical
> decision-making and is not a substitute for professional medical advice.

## Repository structure

Only the files needed to serve the static site live at the repo root — this
is what gets deployed to GitHub Pages:

```
index.html
css/style.css
js/app.js            (scoring engine)
js/config.js         (UI/display metadata)
js/model_weights.js  (trained model: feature vocab + SVM weights, base64-obfuscated)
LICENSE              (usage restrictions + citation requirement)
README.md
```

Everything else (MATLAB source, its `.mat` outputs, evaluation scripts, and
the patient-level test spreadsheet) lives under `dev/`, which is listed in
[`.gitignore`](.gitignore) and is never pushed to the public repo:

```
dev/matlab/generate_features_and_export_weights.m
dev/matlab/deploy_model_iter*.mat
dev/test/evaluate_esopt.ps1
dev/test/evaluate_esopt.py
dev/test/Patient_features_mesial_temporal_lobe_All_centers_22March26.xlsm
```

**Do not remove `dev/` from `.gitignore`** — the test spreadsheet contains
patient-level research data and must not be published in the public repo.

## How the score is computed

The tool mirrors the paper's 3-level hierarchical ensemble, matching the
MATLAB pipeline exactly:

1. **Feature level** — each of the 10 features has its own linear-SVM
   (`fitcsvm`, linear kernel, standardized) trained independently, frozen at
   leave-one-subject-out fold `i == 1` for deployment. For a feature with
   encoded vector `x` (one-hot/multi-hot for categorical/text features,
   `[value]` for numeric features), the decision score is:
   ```
   score = sum_k( beta[k] * (x[k] - mu[k]) / sigma[k] ) + bias
   y_hat = 1 (favorable / seizure-free) if score >= 0, else 0
   ```
   `beta`, `bias`, `mu`, `sigma` come straight from MATLAB's `model.Beta`,
   `model.Bias`, `model.Mu`, `model.Sigma`.
   - **Seizure type and the 3 semiology features** are rendered as
     checkboxes (multiple categories selectable at once), matching MATLAB's
     comma-separated multi-hot encoding — the resulting vector has a `1` for
     every selected category. The set of multi-select features is
     `MULTI_SELECT_FEATURES` in [`js/config.js`](js/config.js).
   - **MRI findings** remain single-select dropdowns (one-hot, exactly one
     `1`).
2. **Modality level** — if a modality has more than one feature, its vote is
   the unweighted average of its features' 0/1 predictions; a single-feature
   modality (seizure type) just passes its own prediction through.
3. **Patient level** — the final score is the unweighted average of the 4
   modality-level votes, shown as a percentage (predicted likelihood of
   1-year freedom from seizure recurrence).

The scoring engine lives in [`js/app.js`](js/app.js). UI/display metadata
(modality grouping, friendly labels, which features allow multi-select)
lives in [`js/config.js`](js/config.js). The trained model itself (feature
vocabulary + SVM weights) lives in [`js/model_weights.js`](js/model_weights.js).

## Plugging in your trained weights

The MATLAB script [`dev/matlab/generate_features_and_export_weights.m`](dev/matlab/generate_features_and_export_weights.m)
is your original feature-encoding + LOSO-CV script with export logic added:

1. Run it against your data as usual (unchanged behavior/outputs).
2. It additionally freezes the trained `fitcsvm` model for every feature at
   LOSO fold `i == deploy_iteration` (set at the top of the export block)
   and writes two new files: `deploy_model_iter<N>.mat` (for reuse in
   MATLAB) and **`model_weights.js`** — already formatted as
   `const MODEL_WEIGHTS = {...};`, ready to use directly.
3. Copy the generated `model_weights.js` into this repo's `js/` folder,
   overwriting the previous one.

No manual conversion or JSON-to-JS translation step is needed — the MATLAB
script writes the browser-ready file directly.

To re-check a newly dropped-in `model_weights.js` against the test cohort,
run [`dev/test/evaluate_esopt.ps1`](dev/test/evaluate_esopt.ps1) (PowerShell,
requires the `ImportExcel` module: `Install-Module ImportExcel -Scope CurrentUser`).
It reimplements the exact same scoring logic as `js/app.js` and reports
accuracy/sensitivity/specificity against `Outcome_value < 1` as ground truth.

## Running locally

This is a static site with no build step or server-side code. Open
`index.html` directly in a browser, or serve the folder locally, e.g.:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploying on GitHub Pages

1. Push this folder to a GitHub repository (e.g. `esopt` or
   `epilepsy-surgery-outcome-tool`). `.gitignore` already excludes `dev/`
   (MATLAB source, `.mat` outputs, and the patient-level test spreadsheet),
   so only the deployable site files get pushed.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`.
4. Save — GitHub will publish the site at
   `https://<your-username>.github.io/<repo-name>/`.

No CI, secrets, or backend are required since everything runs client-side.

## Scaling up

The config is fully data-driven so growth doesn't require touching the
scoring engine:

- **New epilepsy type** (e.g. neocortical temporal, frontal lobe,
  generalized): add a new key to `MODEL_VERSIONS` in `js/config.js` with its
  own `modalities` array and `status: "active"`. It will automatically appear
  in the "Epilepsy Type" dropdown and render its own form.
- **New modality/feature for an existing type**: push a new entry into that
  type's `modalities` (or a modality's `features`) array in `js/config.js`,
  add a matching entry to `MODEL_WEIGHTS.features` in `js/model_weights.js`
  (with the trained `beta`/`bias`/`mu`/`sigma`), and optionally a friendly
  label in `FEATURE_DISPLAY`/`CATEGORY_LABELS`. The UI renders whatever is in
  the config.
- Epilepsy types not yet implemented are listed with `status: "coming_soon"`
  and appear disabled in the dropdown as a visible roadmap marker.

## License, citation & weight protection

See [`LICENSE`](LICENSE) for the full usage terms — in short: viewing/running
the published tool is fine, but reuse, redistribution, or retraining from
the trained model weights or methodology requires written permission, and
any use must cite the manuscript listed at the top of this README.

`js/model_weights.js` base64-encodes the trained weights
(`MODEL_WEIGHTS_B64`, decoded at runtime with `atob()`) so they aren't
plainly readable via a quick view-source. **Be aware this is a deterrent,
not real security** — the browser must decode and use the actual weight
values to compute a score, so anyone willing to open devtools and run
`atob(MODEL_WEIGHTS_B64)` (or just inspect the JS variable at runtime) can
recover them. There is no way to truly hide a "secret" that a static,
client-side page must execute — genuine protection would require moving
scoring to a server-side API instead of a client-side-only GitHub Pages
site, which is a larger architectural change. The `LICENSE` terms are the
actual (legal, not technical) protection against reuse.

## Disclaimer

No medical advice. This tool provides research/educational estimates only,
does not create a medical professional-patient relationship, and does not
constitute a diagnosis, opinion, or treatment recommendation. It is not a
substitute for evaluation by a qualified physician.
