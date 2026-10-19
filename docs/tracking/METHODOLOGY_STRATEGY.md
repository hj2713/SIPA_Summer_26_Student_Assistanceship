# Methodology Strategy

This file is the living strategy log for improving Law Delegation beyond prompt-only classification.

Future agents should read this file before proposing architecture, prompt, benchmark, or research-method changes. Update it whenever the team tries, rejects, accepts, or revises a methodology. The purpose is to preserve the research trail for product management, future engineering decisions, and possible academic publication.

Stable product vision belongs in `README.md` and `Setup-Files/AIM_OF_PROJECT.md`. Active benchmark cases belong in `Project-Tracking/BENCHMARK_LOG.md`. This file sits between them: it records the reasoning behind methodology choices.

---

## Current Situation

The current near-term task is binary `DelegateLaw` classification against the professor's legacy benchmark labels.

Recent large-sample results:

| Prompt | False labels correct | True labels correct | Notes |
| --- | ---: | ---: | --- |
| `Prompt_v8.txt` | 7/8 | 148/161 | Stricter. Better at rejecting non-delegation, but creates more false negatives. |
| `Prompt_v.7_Stage-1_v.4.txt` | 4/8 | 156/161 | Looser. Better true-label recall, but misses half of the rare false cases. |

Important interpretation:

The dataset is highly imbalanced: 8 false labels and 161 true labels. Raw accuracy alone is misleading because an "always true" classifier would get 161/169 correct while failing every false case. We need balanced metrics and class-specific error analysis.

Recommended metrics for this stage:

1. False-class recall: how many professor-false laws are correctly rejected.
2. True-class recall: how many professor-true laws are correctly accepted.
3. Balanced accuracy: average of true-class recall and false-class recall.
4. Confusion matrix per prompt/model/source set.
5. Disagreement taxonomy for each mismatch.

## Core Diagnosis

Prompt engineering alone is not enough.

The system needs to become a coding methodology:

1. fixed benchmark sets;
2. clear source universe per run;
3. versioned prompts and models;
4. structured evidence extraction;
5. active human review;
6. error taxonomy;
7. possible weak-supervision or model-training layer;
8. reproducible run artifacts.

The goal is not "make one magic prompt." The goal is to build a workflow where the professor's domain knowledge becomes machine-usable, testable, and auditable.

## Option 1: Keep Tuning Prompts

Status: Useful but insufficient.

Description:
Continue modifying the natural-language prompt until benchmark accuracy improves.

Benefits:

1. Fast to try.
2. No architecture change.
3. Easy for the professor to inspect.

Risks:

1. Overfits to the current benchmark.
2. Produces unstable tradeoffs between false positives and false negatives.
3. Does not capture why examples are hard.
4. Does not scale well to thousands of laws.

Current view:
Prompt tuning should continue only inside a controlled evaluation loop. It should not be the whole product strategy.

## Option 2: Professor-Curated Dynamic Few-Shot Examples

Status: Promising, but must be formalized.

Description:
Ask the professor to label a small selected set of examples before a run. Use those examples as dynamic demonstrations or calibration cases.

Better framing:
Do not ask for random examples. Ask for archetypes:

1. obvious true delegation;
2. obvious false delegation;
3. technical/procedural amendment;
4. agency mention without meaningful new power;
5. renewal or extension with substantive change;
6. rulemaking / exemption / enforcement power;
7. borderline case the professor finds difficult;
8. case where full law and summary may point in different directions.

Benefits:

1. Converts professor intuition into examples.
2. Supports user-specific calibration if the product later serves multiple researchers.
3. Helps reveal whether the product should reproduce one canonical codebook or support multiple research codebooks.

Risks:

1. Dynamic few-shot examples can make results user-specific.
2. If examples are not versioned, outputs become hard to reproduce.
3. Bad example selection can bias the model.

Current view:
Use curated examples, but store them as versioned calibration sets attached to a campaign or benchmark. Do not inject ad hoc examples silently.

## Option 3: Create A Project Skill / Coding Manual

Status: Recommended, but it should be custom.

Description:
Create a project-specific coding manual that agents and LLM calls can use. This is not just a prompt. It should define terms, edge cases, examples, allowed evidence, benchmark source rules, and failure modes.

What to ask the professor for:

1. A one-sentence definition of `DelegateLaw`.
2. Three examples that are definitely `Y`, with why.
3. Three examples that are definitely `N`, with why.
4. Five borderline examples, with the deciding rule.
5. A list of things that should not count as delegation by themselves.
6. A list of words that usually indicate delegation but can mislead.
7. Whether labels are meant to be canonical truth or replication of a historical codebook.
8. Whether different researchers should be able to use different codebooks.

Why not copy a public `SKILL.md`:
The domain is too specific. A generic legal-analysis skill would likely optimize for legal plausibility, not the professor's historical social-science coding rule. Also, third-party agent skills can carry supply-chain and expectation risks. A custom project skill/manual is safer and more scientifically defensible.

Current view:
Create a project-owned coding manual once the professor can provide rationales for representative examples. This manual can later feed prompts, validation checks, few-shot selection, and benchmark explanations.

## Option 4: Active Learning / Expert Review Queue

Status: Strongly recommended.

Description:
Instead of asking the professor to review random laws, rank laws by informativeness and uncertainty. Send the most useful cases for review.

Signals for review priority:

1. Prompt v7 and v8 disagree.
2. Multiple models disagree.
3. Model confidence is low or rationale is weak.
4. The result conflicts with a known benchmark label.
5. The law contains mixed signals, such as agency mention plus procedural simplification.
6. The law is similar to prior mismatches.

Benefits:

1. Uses professor time efficiently.
2. Builds a high-value calibration set.
3. Creates publishable evidence of iterative coding improvement.
4. Works well with imbalanced labels because rare false cases can be oversampled.

Risks:

1. Needs UI and database support for review queues.
2. Needs careful sampling so the reviewed set does not become biased.

Current view:
This should become a core product feature. It is more important than another prompt-only iteration.

## Option 5: Staged Coding Pipeline

Status: Recommended for later, but not as a hidden chain.

Description:
Move from one-shot classification to a structured sequence:

1. detect financial-regulation scope;
2. identify administrative actors;
3. extract candidate authority verbs and text evidence;
4. classify whether the authority is new/materially expanded;
5. classify `DelegateLaw`;
6. later classify discretion level and constraints.

Architecture requirement:
Each stage should produce stored intermediate outputs. Later stages should read previous stage outputs explicitly. The UI should show these intermediate outputs so researchers can inspect and correct them.

Benefits:

1. Better interpretability.
2. Easier debugging.
3. Matches the professor's workflow better than a single opaque call.
4. Allows columns to depend on prior columns.

Risks:

1. More LLM calls.
2. More schema and state management.
3. Errors can cascade if early stages are wrong.

Current view:
Implement staged coding as an explicit pipeline abstraction, not as hardcoded prompt text. Users should eventually be able to define stage order and dependencies.

## Option 6: Weak Supervision / Labeling Functions

Status: Promising medium-term direction.

Description:
Represent multiple sources of imperfect evidence as labeling functions:

1. prompt v7 vote;
2. prompt v8 vote;
3. stricter model vote;
4. looser model vote;
5. keyword/phrase evidence;
6. agency-and-authority extractor;
7. professor calibration examples;
8. historical benchmark labels where available.

These sources can vote `Y`, vote `N`, or abstain. The system can track agreement, conflict, and confidence.

Benefits:

1. Reduces dependence on one prompt.
2. Makes disagreement visible.
3. Creates a path toward probabilistic labels or a trained classifier.
4. Fits expert-driven domains where labels are expensive.

Risks:

1. More engineering complexity.
2. Requires good logging and evaluation.
3. Needs careful distinction between benchmark labels and weak signals.

Current view:
Do not immediately implement full Snorkel-style modeling. First implement the simpler version: multiple coders/voters plus disagreement review.

## Option 7: Fine-Tuning Or Training A Classifier

Status: Not first move.

Description:
Train a dedicated classifier using benchmark labels, corrected outputs, and extracted features.

Benefits:

1. Can be cheaper and faster at scale.
2. Can produce calibrated probabilities.
3. May outperform prompt-only methods once enough labels exist.

Risks:

1. Current positive/negative imbalance is severe.
2. Labels may encode historical coding rules that need clarification before training.
3. Small labeled data may overfit.
4. Full-law versus summary source mismatch can poison training.

Current view:
Defer until the project has a cleaner labeled dataset, stable source rules, and a larger reviewed calibration set.

## Option 8: LLM Judge / Critic Layer

Status: Use carefully.

Description:
Run a second LLM pass that evaluates whether the first model's label follows the codebook and cited evidence.

Benefits:

1. Can catch weak rationales.
2. Can classify failure modes.
3. Can support review prioritization.

Risks:

1. A judge model can share the same bias as the first model.
2. It can create false confidence.
3. It should not replace benchmark comparison or professor review.

Current view:
Use judge/critic models for triage, not final truth.

## Recommended Near-Term Roadmap

### Milestone 1: Benchmark Runner

Build or formalize a benchmark runner that records:

1. law identifier;
2. source file;
3. expected label;
4. predicted label;
5. prompt version;
6. model;
7. rationale;
8. match/mismatch;
9. mismatch category;
10. run timestamp.

### Milestone 2: Error Taxonomy

For each mismatch, classify the error:

1. prompt too strict;
2. prompt too loose;
3. source text mismatch;
4. historical label ambiguity;
5. model missed evidence;
6. model over-counted agency mention;
7. model ignored financial-regulation scope;
8. benchmark requires professor clarification.

### Milestone 3: Multi-Coder Comparison

Run at least two prompt/model coders and compare:

1. strict coder;
2. loose coder;
3. optional third model;
4. optional evidence extractor.

Use disagreement to prioritize review.

### Milestone 4: Active Review Queue

Add a review queue to the product:

1. highest priority: benchmark mismatches;
2. next: prompt/model disagreements;
3. next: low confidence or weak evidence;
4. next: rare-class candidates.

Professor corrections become versioned calibration data.

### Milestone 5: Staged Pipeline

Refactor coding from one-shot field extraction into explicit stages:

1. `ScopeStage`;
2. `ActorExtractionStage`;
3. `AuthorityEvidenceStage`;
4. `DelegationDecisionStage`;
5. later `ConstraintStage`;
6. later `DiscretionRankStage`.

Each stage stores its output and can depend on previous stages.

## Architecture Direction

Recommended backend objects:

1. `CodingPipeline`: owns ordered stages.
2. `CodingStage`: interface with `run(input, context) -> stage_result`.
3. `StageResult`: value, evidence, rationale, confidence, errors, metadata.
4. `BenchmarkRun`: records prompt/model/source/evaluation metadata.
5. `ReviewQueueItem`: records why a law needs human review.
6. `CalibrationExample`: professor-reviewed example with label and rationale.
7. `CodingManual`: versioned project codebook / skill-like instruction layer.

Recommended database additions eventually:

1. `benchmark_runs`;
2. `benchmark_run_items`;
3. `calibration_examples`;
4. `coding_stage_results`;
5. `review_queue`;
6. `coding_manual_versions`.

Design principle:
Campaign coding should not know about one experiment's prompt tricks. It should call stable pipeline components. Experiments can create new stages or manuals and then promote them deliberately.

## Perspective Notes

### Quantitative Analysis Professor View

The system needs reproducibility, benchmark discipline, class-specific metrics, and documented failure modes. Accuracy is not enough; the method has to be explainable and publishable.

### Student / Research Assistant View

The product should make review tasks clear: "Here is the law, expected label, model label, evidence, and why this is being flagged." The student should not need to reverse-engineer the whole pipeline.

### Researcher View

The product should preserve uncertainty and disagreement. It should not pretend the model is always right. It should help convert disagreement into improved codebook rules.

### Senior Software Developer View

The app needs clean separations: production pipeline, experiment runners, benchmark tracking, calibration data, and UI review workflows should be separate modules.

### AI Engineer View

The next improvement is not another monolithic prompt. It is an evaluation-driven system with multiple weak signals, active learning, staged extraction, and human feedback loops.

## External Ideas And Sources

These sources are not exact matches for this project, but they support useful design patterns.

1. Snorkel / weak supervision: subject-matter experts write labeling functions, and the system combines noisy sources into probabilistic labels. This supports our idea of multiple prompt/model/rule voters instead of one prompt.
   Source: https://arxiv.org/abs/1711.10160

2. Language models as weak-supervision labelers: LLM prompts can be treated as labeling functions and combined/denoised rather than trusted individually.
   Source: https://arxiv.org/abs/2205.02318

3. LLM-assisted deductive coding: LLMs can support codebook-based classification, but the method should identify codes where the model is guessing and decide when humans are needed.
   Source: https://arxiv.org/abs/2306.14924

4. LLM + expert codebooks: combining LLMs with expert-drafted codebooks can reach fair to substantial agreement, but expert codebook quality matters.
   Source: https://arxiv.org/abs/2304.10548

5. Active learning in legal document review: active learning can help find informative legal documents for review, but strategy matters and can become less effective over time.
   Source: https://arxiv.org/abs/1904.01719

6. Label Studio / Prodigy / Argilla: existing tools show the value of model-assisted annotation, pre-annotations, active learning, and human feedback loops. We should learn from them, but our product is more specialized because it combines legal-codebook reasoning, benchmark replication, staged coding, and local campaign dashboards.
   Sources: https://labelstud.io/guide/ml, https://prodi.gy/docs/recipes, https://docs.argilla.io/latest/

7. DSPy prompt optimization: prompt optimization frameworks can optimize instructions against a metric. This is worth exploring only after we have a reliable benchmark runner and metric.
   Source: https://dspy.ai/getting-started/gepa-optimization/

## Current Recommendation

Use `Prompt_v8.txt` as the stricter baseline for rare false-case detection, but do not ship it as the final answer.

The next project step should be:

1. create benchmark runner output files;
2. compute class-specific metrics;
3. build an error taxonomy for the 14 current mismatches under v8 and the 9 current mismatches under v7;
4. identify cases where v7 and v8 disagree;
5. ask the professor only about the highest-value disagreement cases;
6. store professor explanations as calibration examples;
7. design staged pipeline support after the benchmark runner is stable.

