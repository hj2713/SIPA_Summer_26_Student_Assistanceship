# Trying Experiments

This folder is an exploratory sandbox for prompt and evaluation experiments.

Production campaign coding should not import from this folder. If an experiment becomes part of the product, move it into a production service module, add tests, and make the dependency explicit.

## Current Files

1. `run_eval.py`: standalone evaluation runner for prompt experiments.
2. `segmenter.py`: experimental statutory section splitter and keyword screener.
3. `few_shot_context.py`: experimental few-shot prompt examples.
4. `outputs/`: generated CSV and markdown logs from exploratory runs.

## Running The Experiment Runner

By default, `run_eval.py` reads summaries from `Updates/15 Laws Summary` and writes outputs to `backend/app/trying/outputs`.

Override paths when needed:

```bash
cd backend
EVAL_INPUT_DIR="../Updates/15 Laws Summary" EVAL_OUTPUT_DIR="app/trying/outputs" venv/bin/python app/trying/run_eval.py
```

## Boundary Rule

This folder can depend on production app services, but production app services should not depend on this folder.

