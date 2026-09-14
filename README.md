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
modalities without a rewrite.

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
