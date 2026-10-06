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


## How the score is computed

The tool mirrors the paper's 3-level hierarchical ensemble, matching the
MATLAB pipeline exactly:

1. **Feature level** — each of the 10 features has its own linear-SVM
   (`fitcsvm`, linear kernel, standardized, class-weighted) trained once on
   the full cohort. For a feature with encoded vector `x` (one-hot/multi-hot
   for categorical features, `[value]` for numeric features), the decision
   score and probability are:
   ```
   s = sum_k( beta[k] * (x[k] - mu[k]) / sigma[k] ) + bias
   p = 1 / (1 + exp(-s))     // positive class = Good (seizure-free) outcome
   ```
   `beta`, `bias`, `mu`, `sigma` come straight from MATLAB's `model.Beta`,
   `model.Bias`, `model.Mu`, `model.Sigma`.
   - **Seizure type and the 3 semiology features** (`feature_types` =
     `multi_cat`) are rendered as checkboxes (multiple categories selectable
     at once), matching MATLAB's comma-separated multi-hot encoding — the
     resulting vector has a `1` for every selected category.
   - **MRI findings** (`feature_types` = `single_cat`) remain single-select
     dropdowns (one-hot, exactly one `1`).
2. **Modality level** — if a modality has more than one feature, its vote is
   the unweighted average of its features' probabilities `p`; a
   single-feature modality (seizure type) just passes its own probability
   through.
3. **Patient level** — the final score is the unweighted average of the 4
   modality-level votes, shown as a percentage (predicted likelihood of
   1-year freedom from seizure recurrence). The tool additionally flags
   whether the patient is above or below `meta.cutoff_sens80`, a
   classification cutoff tuned for 80% sensitivity on the training cohort.

The scoring engine lives in [`js/app.js`](js/app.js). UI/display metadata
(modality grouping, friendly labels) lives in [`js/config.js`](js/config.js).
The trained model itself (feature vocabulary in `vocabs`, SVM weights in
`features`, and the `cutoff_sens80` threshold in `meta`) lives in
[`js/model_weights.js`](js/model_weights.js).



## License, citation & weight protection

See [`LICENSE`](LICENSE) for the full usage terms — in short: viewing/running
the published tool is fine, but reuse, redistribution, or retraining from
the trained model weights or methodology requires written permission, and
any use must cite the manuscript listed at the top of this README.

Earlier revisions of `js/model_weights.js` base64-encoded the trained
weights (`MODEL_WEIGHTS_B64`, decoded at runtime with `atob()`) as a mild
deterrent against casual view-source scraping; the current file is plain
JSON. Either way, **this was never real security** — the browser must
decode and use the actual weight values to compute a score, so anyone
willing to open devtools can recover them regardless of encoding. There is
no way to truly hide a "secret" that a static, client-side page must
execute — genuine protection would require moving scoring to a server-side
API instead of a client-side-only GitHub Pages site, which is a larger
architectural change. The `LICENSE` terms are the actual (legal, not
technical) protection against reuse. The evaluation scripts in `dev/test/`
still support both the plain-JSON and base64-encoded formats.

## Disclaimer

No medical advice. This tool provides research/educational estimates only,
does not create a medical professional-patient relationship, and does not
constitute a diagnosis, opinion, or treatment recommendation. It is not a
substitute for evaluation by a qualified physician.
