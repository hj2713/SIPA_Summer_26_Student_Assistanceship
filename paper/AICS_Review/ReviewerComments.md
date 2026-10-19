Dear author(s),
Thank you for submitting your work to AICS 2026. We regret to inform you that your submission has not been
accepted for inclusion in this year's conference. There were many factors considered in making this decision.
Reviewer ratings were important, but we also read reviewers’ comments and discussions closely to understand the
reasons for their ratings. We arrived at the final decision by balancing these points of view.
Thank you,
The AICS 2026 Organising Committee
SUBMISSION: 81
TITLE: A Replicable Theory-Guided LLM Workflow for Measuring Legal Delegation and Administrative Discretion
----------------------- REVIEW 1 ---------------------
SUBMISSION: 81
TITLE: A Replicable Theory-Guided LLM Workflow for Measuring Legal Delegation and Administrative Discretion
----------- Overall evaluation -----------
SCORE: -2 (reject)
----- TEXT:
This paper addresses an important issue at the current stage of LLM deployment. This issue is the challenge of
developing workflows or ways of working with LLMs to address complex tasks.
However, the paper is not written in a way that will be accessible to an AICS audience. The paper contains a
significant amount of terminology that will not be understood by that audience. Sometimes this terminology is
explained somewhat later in the paper; however, I was in the dark when I completed the Abstract and Introduction.
Here are some of the issues:
"Coding complex legal texts": I have some idea what coding means in this context but I really have no insight into
what the task looks like.
What is an "auditable measurement instrument"? I got to the end of the Introduction without understanding what was
meant by "measurement.
What is "discretion rank"?
I know what one-shot classification is but I don't know what "one-shot classification collapses linked judgments into a
single output" means.
What does it mean to "separate generative LLM judgments from deterministic theoretical mappings"?
What is the "constraint index"?
In summary, I don't think this paper will be accessible to AICS attendees. The opening sections of the paper would
need to be radically reworked to explain the task being addressed.
----------------------- REVIEW 2 ---------------------

SUBMISSION: 81
TITLE: A Replicable Theory-Guided LLM Workflow for Measuring Legal Delegation and Administrative Discretion
----------- Overall evaluation -----------
SCORE: 2 (accept)
----- TEXT:
Summary and contribution:
The paper explores the design of LLM workflows to extract key features, namely delegated authority and
administrative discretion, from a benchmark dataset comprising summarised texts of 169 US financial regulation
laws, of which 161 mention delegated authority and 8 do not. The dataset also comprises administrative discretion
levels for each law summary, hand-annotated by expert coders.
The proposed workflow consists of two stages of LLM classification. Stage 1 establishes the presence or absence of
delegated authority through binary classification. In Stage 2, administrative discretion is ranked from 0–4 based on
intermediate extracted features comprising the presence and amount of delegated authority and the strength of
statutory constraints. Three ordinal classification strategies are investigated: Sequential Ordinal Cascade, Direct
Multiclass Rank Prediction and Two-Band Rank Classification. In parallel, a theory-guided deterministic rank
computation derives the administrative discretion rank from the same intermediate classifications. The rank produced
by each classification strategy is compared against the deterministic rank, with disagreements flagged for expert
review.
The three classification strategies are evaluated across five LLMs: Gemini 3.5, Qwen 3, DeepSeek, Kimi 2.5 and
GPT-OSS. Their performance is also compared against an unconstrained single-pass baseline prompt, executed
using Gemini 3.5 only. The central contribution of the paper is a decomposed LLM classification workflow in which
intermediate judgments underlying administrative discretion are explicitly extracted and retained, in contrast to the
authors’ unconstrained single-pass baseline that directly predicts the final classification.
Originality / contribution:
The paper presents an interesting application of LLM-based classification to the analysis of legislative texts. Its main
contribution is the decomposition of administrative discretion into explicit intermediate classifications, together with
the comparison of three ordinal classification strategies and a theory-guided deterministic rank computation. This
provides a structured and auditable alternative to the unconstrained single-pass baseline investigated in the paper.
Technical soundness:
The overall classification algorithm and the deterministic mapping from the presence and amount of delegated
authority and the strength of statutory constraints to administrative discretion ranks 0–4 are clearly defined. However,

the implementation of the delegation gate in Stage 1 requires clarification. Although the algorithm specifies LLM-
based binary classification at this stage, the model used to perform this classification appears to be missing from the

methodological description.
Another small nomenclature issue used throughout the paper is one-shot prompt, where the authors intend to say
single-pass prompt. A one-shot prompt provides exactly one single worked-out example within the prompt to help the
LLM make sense of the instructions and act appropriately, whereas a single-pass prompt is a single prompt providing
a result irrespective of how many examples are provided within the prompt. The authors’ claim is that the one-shot
prompt (actually single-pass prompt) cannot reliably assign a proper administrative discretion level given the different
classifications it needs to perform simultaneously with one prompt, leading to a collapsed logic that hides these
intermediate extractions. Thus, they are not traceable and auditable, and hence, the paper offers a solution in the
form of an LLM workflow.
Experimental / empirical quality:
Strong. The evaluation is clearly structured across both stages, with appropriate metrics for the binary delegation and
ordinal ranking tasks. The three ranking strategies are systematically evaluated across five LLMs, with the results
clearly reported and discussed.
Evidence for claims:
Good. The experimental results are clearly reported and generally support the comparative claims made by the
authors. The paper also reports diagnostic consistency checks between the strategy-based classifications and the
theory-guided deterministic rank computation, with disagreements surfaced for expert review.

Significance / usefulness:
Good. The workflow provides a useful approach for making LLM-based legislative classification more transparent by
retaining the intermediate judgments underlying administrative discretion and surfacing disagreements for expert
review.
Clarity:
Strong overall. The problem, proposed workflow, classification strategies and evaluation experiment are clearly
presented. The main clarity issue identified is the use of one-shot where single-pass appears to be intended.
Reproducibility:
Good overall. The classification workflow, ranking strategies, deterministic rank computation and evaluation
procedure are sufficiently described to understand the experimental setup. However, the model used for the Stage 1
delegation gate should be explicitly identified.
AICS relevance:
Strong. The paper is clearly within AI through its investigation of LLM-based classification workflows, ordinal
classification strategies, comparisons across multiple LLMs and human review of classification disagreements.
