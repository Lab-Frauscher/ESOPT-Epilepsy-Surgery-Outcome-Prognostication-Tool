// =============================================================================
// ESOPT APP LOGIC
// Renders the modality/feature form from config.js (UI metadata) + the
// trained weights in model_weights.js (MODEL_WEIGHTS), then computes the
// hierarchical ensemble score on "Calculate".
//
// Feature-level decision score  s = sum_k( beta[k] * (x[k]-mu[k])/sigma[k] ) + bias
// where x is the one-hot vector (categorical) or [value] (numeric).
// Feature-level probability     p = 1 / (1 + exp(-s))  (positive class = Good outcome)
// Modality vote = mean of feature probabilities in that modality.
// Patient score = mean of modality votes -> likelihood of 1-year seizure freedom.
// Binary call-out uses MODEL_WEIGHTS.meta.cutoff_sens80 (tuned for 80% sensitivity).
// =============================================================================

(function () {
  "use strict";

  const epilepsyTypeSelect = document.getElementById("epilepsyType");
  const inputsPanel = document.getElementById("inputsPanel");
  const resultsBox = document.getElementById("resultsBox");
  const calculateBtn = document.getElementById("calculateBtn");

  function fieldId(featureName) {
    return `f_${featureName}`;
  }

  function categoryLabel(featureName, rawValue) {
    const perFeature = CATEGORY_LABELS[featureName];
    if (perFeature && perFeature[rawValue]) return perFeature[rawValue];
    if (CATEGORY_LABELS[rawValue] && typeof CATEGORY_LABELS[rawValue] === "string") {
      return CATEGORY_LABELS[rawValue];
    }
    return rawValue;
  }

  // model_weights.js stores the category vocabulary once per feature in the
  // top-level `vocabs` array (parallel to `feature_names`), not inline per
  // feature entry -- look it up by position.
  function getComponents(featureName) {
    const idx = MODEL_WEIGHTS.feature_names.indexOf(featureName);
    return idx >= 0 ? MODEL_WEIGHTS.vocabs[idx] : [];
  }

  // ---- Populate the epilepsy-type selector -----------------------------------
  function populateEpilepsyTypes() {
    Object.keys(MODEL_VERSIONS).forEach((key) => {
      const version = MODEL_VERSIONS[key];
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent =
        version.status === "coming_soon" ? `${version.label} (coming soon)` : version.label;
      opt.disabled = version.status !== "active";
      epilepsyTypeSelect.appendChild(opt);
    });
    epilepsyTypeSelect.value = "MTLE";
  }

  // ---- Render the input form for the selected epilepsy type ------------------
  function renderForm(versionKey) {
    const version = MODEL_VERSIONS[versionKey];
    inputsPanel.innerHTML = "";

    if (!version || version.status !== "active") {
      inputsPanel.innerHTML = `<p class="empty-note">No model is available yet for this epilepsy type.</p>`;
      return;
    }

    version.modalities.forEach((modality) => {
      const section = document.createElement("div");
      section.className = "modality-section";

      const heading = document.createElement("h2");
      heading.textContent = modality.name;
      section.appendChild(heading);

      modality.features.forEach((featureName) => {
        const weightEntry = MODEL_WEIGHTS.features[featureName];
        const display = FEATURE_DISPLAY[featureName] || { label: featureName };

        const row = document.createElement("div");
        row.className = "field-row";

        const isMultiSelect = weightEntry && weightEntry.type === "multi_cat";

        const label = document.createElement("label");
        label.setAttribute("for", fieldId(featureName));
        label.textContent = isMultiSelect ? `${display.label} (select all that apply)` : display.label;
        row.appendChild(label);

        if (!weightEntry) {
          const note = document.createElement("span");
          note.className = "unit-label";
          note.textContent = "No trained model found for this feature.";
          row.appendChild(note);
          section.appendChild(row);
          return;
        }

        if (isMultiSelect) {
          const group = document.createElement("div");
          group.className = "checkbox-group";
          group.id = fieldId(featureName);
          group.dataset.feature = featureName;

          getComponents(featureName).forEach((comp) => {
            const optLabel = document.createElement("label");
            optLabel.className = "checkbox-option";
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.value = comp;
            cb.dataset.feature = featureName;
            optLabel.appendChild(cb);
            optLabel.appendChild(document.createTextNode(categoryLabel(featureName, comp)));
            group.appendChild(optLabel);
          });
          row.appendChild(group);
        } else if (weightEntry.type === "single_cat") {
          const select = document.createElement("select");
          select.id = fieldId(featureName);
          select.dataset.feature = featureName;

          const placeholderOpt = document.createElement("option");
          placeholderOpt.value = "";
          placeholderOpt.textContent = "Select...";
          placeholderOpt.disabled = true;
          placeholderOpt.selected = true;
          select.appendChild(placeholderOpt);

          getComponents(featureName).forEach((comp) => {
            const opt = document.createElement("option");
            opt.value = comp;
            opt.textContent = categoryLabel(featureName, comp);
            select.appendChild(opt);
          });
          row.appendChild(select);
        } else if (weightEntry.type === "numeric") {
          const input = document.createElement("input");
          input.type = "number";
          input.step = display.step || "any";
          input.id = fieldId(featureName);
          input.dataset.feature = featureName;
          if (display.placeholder) input.placeholder = display.placeholder;
          row.appendChild(input);
        }

        section.appendChild(row);
      });

      inputsPanel.appendChild(section);
    });
  }

  // ---- Feature-level prediction (linear-SVM decision score -> probability) ---
  // MATLAB's jsonencode collapses 1-element beta/mu/sigma (numeric features)
  // into plain scalars instead of 1-element arrays -- normalize to arrays.
  function toArray(v) {
    return Array.isArray(v) ? v : [v];
  }

  function sigmoid(s) {
    return 1 / (1 + Math.exp(-s));
  }

  function featureScore(featureName, x) {
    const w = MODEL_WEIGHTS.features[featureName];
    const beta = toArray(w.beta);
    const mu = toArray(w.mu);
    const sigma = toArray(w.sigma);
    let score = w.bias;
    for (let k = 0; k < beta.length; k++) {
      if (sigma[k] === 0) continue; // zero-variance predictor in training -> no contribution
      score += beta[k] * ((x[k] - mu[k]) / sigma[k]);
    }
    return score;
  }

  function categoricalPrediction(featureName, selectedValues) {
    // Reproduces MATLAB's multi_hot row for this feature (1 at every selected
    // component's index, 0 elsewhere) using the same vocab column order.
    const components = getComponents(featureName);
    const x = components.map((comp) => (selectedValues.includes(comp) ? 1 : 0));
    if (!x.some((v) => v === 1)) return null;
    const score = featureScore(featureName, x);
    return { p: sigmoid(score), score };
  }

  function numericPrediction(featureName, value) {
    if (Number.isNaN(value)) return null;
    const score = featureScore(featureName, [value]);
    return { p: sigmoid(score), score };
  }

  // ---- Gather inputs, run the 3-level hierarchical ensemble -------------------
  function computeScore(versionKey) {
    const version = MODEL_VERSIONS[versionKey];
    const modalityResults = [];
    const missing = [];

    version.modalities.forEach((modality) => {
      const featureResults = [];

      modality.features.forEach((featureName) => {
        const w = MODEL_WEIGHTS.features[featureName];
        if (!w) return;
        const display = FEATURE_DISPLAY[featureName] || { label: featureName };
        let prediction = null;

        if (w.type === "multi_cat") {
          const container = document.getElementById(fieldId(featureName));
          const selected = Array.from(
            container.querySelectorAll('input[type="checkbox"]:checked')
          ).map((cb) => cb.value);
          if (selected.length === 0) {
            missing.push(display.label);
          } else {
            prediction = categoricalPrediction(featureName, selected);
          }
        } else if (w.type === "single_cat") {
          const el = document.getElementById(fieldId(featureName));
          if (!el.value) {
            missing.push(display.label);
          } else {
            prediction = categoricalPrediction(featureName, [el.value]);
          }
        } else if (w.type === "numeric") {
          const el = document.getElementById(fieldId(featureName));
          if (el.value === "") {
            missing.push(display.label);
          } else {
            prediction = numericPrediction(featureName, parseFloat(el.value));
          }
        }

        if (prediction) {
          featureResults.push({ name: display.label, ...prediction });
        }
      });

      if (featureResults.length > 0) {
        // Modality vote = mean of feature-level probabilities (matches MATLAB's
        // pred_pat_final grouping: mean(pred_pat(:,group_cols),2)).
        const modalityVote = featureResults.reduce((sum, r) => sum + r.p, 0) / featureResults.length;
        modalityResults.push({
          name: modality.name,
          vote: modalityVote,
          features: featureResults
        });
      }
    });

    return { missing, modalityResults };
  }

  function riskCategory(p) {
    if (p >= 0.66) return { label: "Higher likelihood", className: "risk-high" };
    if (p >= 0.33) return { label: "Intermediate likelihood", className: "risk-mid" };
    return { label: "Lower likelihood", className: "risk-low" };
  }

  function renderResults(missing, modalityResults) {
    if (missing.length > 0) {
      resultsBox.className = "results-box results-empty";
      resultsBox.innerHTML = `<p>Please complete the following field(s) before calculating: <strong>${missing.join(
        ", "
      )}</strong>.</p>`;
      return;
    }

    const patientScore =
      modalityResults.reduce((sum, m) => sum + m.vote, 0) / modalityResults.length;
    const pct = Math.round(patientScore * 100);
    const risk = riskCategory(patientScore);

    const breakdownRows = modalityResults
      .map((m) => {
        const modPct = Math.round(m.vote * 100);
        return `
          <div class="breakdown-row">
            <div class="breakdown-label">${m.name}</div>
            <div class="breakdown-bar">
              <div class="breakdown-fill" style="width:${modPct}%"></div>
            </div>
            <div class="breakdown-value">${modPct}%</div>
          </div>`;
      })
      .join("");

    const cutoff = MODEL_WEIGHTS.meta && MODEL_WEIGHTS.meta.cutoff_sens80;
    const cutoffNote =
      typeof cutoff === "number"
        ? `<p class="cutoff-note">Model cutoff tuned for 80% sensitivity: <strong>${Math.round(
            cutoff * 100
          )}%</strong> &mdash; this patient is <strong>${
            patientScore >= cutoff ? "above" : "below"
          }</strong> the cutoff (predicted <strong>${
            patientScore >= cutoff ? "good" : "poor"
          }</strong> outcome).</p>`
        : "";

    resultsBox.className = `results-box ${risk.className}`;
    resultsBox.innerHTML = `
      <div class="score-headline">
        <div class="score-value">${pct}%</div>
        <div class="score-desc">
          Predicted patient-level score for <strong>1-year</strong> freedom from seizure recurrence
          <div class="risk-tag">${risk.label}</div>
        </div>
      </div>
      ${cutoffNote}
      <h3 class="breakdown-title">Modality-level breakdown</h3>
      ${breakdownRows}
    `;
  }

  function resetResultsBox() {
    resultsBox.className = "results-box results-empty";
    resultsBox.innerHTML =
      "<p>Fill in all fields and press <strong>Calculate</strong> to see the predicted 1-year seizure-freedom score.</p>";
  }

  // ---- Event wiring -------------------------------------------------------
  calculateBtn.addEventListener("click", () => {
    resetResultsBox();
    const versionKey = epilepsyTypeSelect.value;
    const { missing, modalityResults } = computeScore(versionKey);
    renderResults(missing, modalityResults);
  });

  epilepsyTypeSelect.addEventListener("change", () => {
    renderForm(epilepsyTypeSelect.value);
    resetResultsBox();
  });

  // ---- Init -----------------------------------------------------------------
  populateEpilepsyTypes();
  renderForm(epilepsyTypeSelect.value);
})();
