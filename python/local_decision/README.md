# sks_local_decision

Resident inference worker for the optional SKS local decision provider.

- `python -I -m sks_local_decision.worker --snapshot <dir> --receipt <file>`:
  NDJSON worker (stdin/stdout protocol v1). Loads the model once, runs a
  synthetic warm-up that compares the sequential reference path with the
  batched path, then answers `infer` frames one at a time.
- `python -I -m sks_local_decision.snapshot download --repo <id> --revision <sha> --dest <dir>`:
  explicit-install-only download of a pinned model snapshot. The runtime
  worker never uses the network.

CPU-only tests (no MLX import): `python -m unittest discover -s tests -p 'test_scoring.py'`,
`... -p 'test_protocol.py'`. `test_engine_real.py` needs `SKS_LOCAL_DECISION_SNAPSHOT`
and an MLX-capable interpreter; otherwise it is skipped with a reported reason.

Implementation origin: `sks`. The design follows the audited upstream engine
`harshatheg/Qwen-2.5-1B-RLCD@2af86848be75847ccb3553b0941cc51d6ef7e4e9`
(Apache-2.0) but no upstream code is executed.
