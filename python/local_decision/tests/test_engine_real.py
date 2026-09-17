"""Real-model verification. Skipped (with a reported reason) unless both an MLX
interpreter and SKS_LOCAL_DECISION_SNAPSHOT (a verified local snapshot) exist.
Mocks are never used here: a skip is reported as a skip, not a pass."""

import json
import os
import statistics
import time
import unittest
from pathlib import Path

SNAPSHOT = os.environ.get("SKS_LOCAL_DECISION_SNAPSHOT", "").strip()
REPORT = os.environ.get("SKS_LOCAL_DECISION_REPORT", "").strip()

try:
    import mlx.core  # noqa: F401
    MLX_AVAILABLE = True
    MLX_REASON = ""
except Exception as error:  # noqa: BLE001
    MLX_AVAILABLE = False
    MLX_REASON = f"mlx import failed: {type(error).__name__}"

SKIP_REASON = None
if not SNAPSHOT:
    SKIP_REASON = "SKS_LOCAL_DECISION_SNAPSHOT not set (no verified local snapshot)"
elif not MLX_AVAILABLE:
    SKIP_REASON = MLX_REASON
elif not Path(SNAPSHOT).is_dir():
    SKIP_REASON = f"snapshot directory missing: {SNAPSHOT}"


@unittest.skipIf(SKIP_REASON is not None, SKIP_REASON or "")
class RealEngineTests(unittest.TestCase):
    engine = None
    report = {}

    @classmethod
    def setUpClass(cls):
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
        from sks_local_decision import ENGINE_VERSION
        from sks_local_decision.engine import MlxDecisionEngine
        from sks_local_decision.snapshot import tokenizer_digest
        config = json.loads((Path(SNAPSHOT) / "config.json").read_text())
        quant = config.get("quantization") or {}
        evidence = {
            "modelId": os.environ.get("SKS_LOCAL_DECISION_MODEL_ID", "local-snapshot"),
            "modelRevision": os.environ.get("SKS_LOCAL_DECISION_MODEL_REVISION", "local"),
            "engineVersion": ENGINE_VERSION,
            "tokenizerDigest": tokenizer_digest(Path(SNAPSHOT)),
            "quantization": f"{quant.get('bits')}bit-g{quant.get('group_size')}" if quant else "none",
            "implementationOrigin": "sks",
        }
        cls.engine = MlxDecisionEngine(SNAPSHOT, evidence)
        cls.engine.load()
        cls.report = {"loadMs": cls.engine.load_ms, "warmup": cls.engine.warmup(), "snapshot": SNAPSHOT}

    @classmethod
    def tearDownClass(cls):
        if REPORT:
            Path(REPORT).write_text(json.dumps(cls.report, indent=2))

    def _input(self, request_id, summary, kind="planning", **facts):
        from sks_local_decision.schemas import synthetic_input
        value = synthetic_input(request_id)
        value["kind"] = kind
        value["summary"] = summary
        value["facts"].update(facts)
        return value

    def test_warmup_paths_agree(self):
        warmup = self.report["warmup"]
        self.assertTrue(warmup["argmaxEqual"], warmup)
        self.assertLessEqual(warmup["maxAbsProbabilityDiff"], 1e-3, warmup)
        self.assertEqual(warmup["sequentialForwardPasses"], 3)
        self.assertEqual(warmup["batchedForwardPasses"], 2)

    def test_sequential_and_batched_agree_on_several_inputs(self):
        inputs = [
            self._input("r-1", "Rename a helper in two files; no tests fail."),
            self._input("r-2", "Redesign the authentication flow across five services and migrate the session store.", highRisk=True, gateProfile="full"),
            self._input("r-3", "Two node:test files fail after the implementation slice; the environment is unchanged.", kind="recovery", failedChecks=2, attemptIndex=1),
        ]
        rows = []
        for value in inputs:
            paths = self.engine.score_paths(value)
            seq, bat = paths["sequential"]["probs"], paths["batched"]["probs"]
            max_abs = max(abs(a - b) for left, right in zip(seq, bat) for a, b in zip(left, right))
            self.assertLessEqual(max_abs, 1e-3, (value["requestId"], seq, bat))
            for left, right in zip(seq, bat):
                self.assertEqual(left.index(max(left)), right.index(max(right)))
            rows.append({"requestId": value["requestId"], "maxAbsDiff": max_abs,
                         "sequentialMs": paths["sequential"]["inference_ms"], "batchedMs": paths["batched"]["inference_ms"],
                         "sequentialTokens": paths["sequential"]["processed_tokens"], "batchedTokens": paths["batched"]["processed_tokens"]})
        self.report["agreement"] = rows

    def test_field_order_and_request_isolation(self):
        from sks_local_decision.engine import plan_prompt
        value = self._input("iso-a", "Add a null check to one function and its test.")
        plan = plan_prompt(self.engine.tokenizer, value)
        forward = self.engine._score(plan, "batched")["probs"]
        reversed_plan = {"prefix_ids": plan["prefix_ids"], "fields": list(reversed(plan["fields"]))}
        backward = list(reversed(self.engine._score(reversed_plan, "batched")["probs"]))
        for left, right in zip(forward, backward):
            for a, b in zip(left, right):
                self.assertLessEqual(abs(a - b), 1e-4)
        other = self._input("iso-b", "Rewrite the whole build system and every CI workflow.", highRisk=True)
        self.engine.infer(other)
        again = self.engine._score(plan_prompt(self.engine.tokenizer, value), "batched")["probs"]
        for left, right in zip(forward, again):
            for a, b in zip(left, right):
                self.assertLessEqual(abs(a - b), 1e-4)

    def test_infer_result_shape_and_warm_latency(self):
        value = self._input("shape-1", "Update two independent config readers to accept a new key.")
        samples = []
        result = None
        for _ in range(5):
            started = time.perf_counter()
            result = self.engine.infer(value)
            samples.append((time.perf_counter() - started) * 1000.0)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(sorted(result["fields"]), ["effortAdvice", "fanoutAdvice", "workloadClass"])
        for field in result["fields"].values():
            self.assertAlmostEqual(sum(c["candidateProbability"] for c in field["choices"]), 1.0, places=6)
        self.assertTrue(result["compute"]["sharedPrefill"])
        self.assertEqual(result["compute"]["forwardPasses"], 2)
        self.assertIsInstance(result["compute"]["inputTokens"], int)
        self.assertFalse(result["timing"]["coldStart"])
        self.report["warmInferMs"] = {"samples": samples, "median": statistics.median(samples), "max": max(samples)}

    def test_oversized_prompt_abstains(self):
        # ~2 tokens per 3 characters keeps this under the 8 KiB summary cap but far over 2048 tokens
        value = self._input("big-1", " ".join(f"x{i}" for i in range(1400))[:8000])
        result = self.engine.infer(value)
        self.assertEqual(result["status"], "abstain")
        self.assertEqual(result["reason"], "invalid_request")


if __name__ == "__main__":
    unittest.main()
