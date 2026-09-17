"""Bounded-candidate decision engine on MLX (implementation origin: sks).

The model is asked fixed multiple-choice questions and answers with a single
letter. Trusted code maps candidate logits at the answer position onto enum
values (no free-form JSON is generated or parsed). Two paths exist:

* sequential reference: one full forward pass per field;
* batched: shared prefix prefilled once into the KV cache, broadcast across
  the field batch, one batched forward pass for all field suffixes.

The batched path is only trusted after the warm-up shows it agrees with the
reference path on the same input. MLX is imported lazily so every other module
stays CPU-testable.
"""

from __future__ import annotations

import copy
import time
from typing import Any

from . import ENGINE_VERSION
from .schemas import LABELS, fields_for, render_field_suffix, render_prefix, synthetic_input
from .scoring import candidate_probs, field_result

MAX_PROMPT_TOKENS = 2048
AGREEMENT_TOLERANCE = 1e-3


class EngineError(RuntimeError):
    def __init__(self, code: str, detail: str | None = None):
        super().__init__(f"{code}:{detail}" if detail else code)
        self.code = code


class TokenizationError(EngineError):
    def __init__(self, detail: str):
        super().__init__("unsupported_tokenization", detail)


def _encode(tokenizer: Any, text: str) -> list[int]:
    return [int(t) for t in tokenizer.encode(text, add_special_tokens=False)]


def plan_prompt(tokenizer: Any, decision_input: dict) -> dict:
    """Tokenize prefix and per-field suffixes with boundary and label checks.

    Every boundary is verified on the final concatenated text: prefix|suffix and
    prefix+suffix|label must tokenize identically whether joined or split, and
    each label must be exactly one token. Otherwise the request abstains with
    `unsupported_tokenization`; no partial token trie is attempted.
    """
    prefix_text = render_prefix(decision_input)
    prefix_ids = _encode(tokenizer, prefix_text)
    fields = []
    for spec in fields_for(decision_input["kind"]):
        suffix_text, labels = render_field_suffix(spec)
        suffix_ids = _encode(tokenizer, suffix_text)
        joined = _encode(tokenizer, prefix_text + suffix_text)
        if joined != prefix_ids + suffix_ids:
            raise TokenizationError(f"prefix_suffix_boundary:{spec.name}")
        label_ids = []
        for label in labels:
            with_label = _encode(tokenizer, prefix_text + suffix_text + label)
            if with_label[: len(joined)] != joined or len(with_label) != len(joined) + 1:
                raise TokenizationError(f"label_not_single_token:{spec.name}:{label}")
            label_ids.append(with_label[-1])
        if len(set(label_ids)) != len(label_ids):
            raise TokenizationError(f"label_collision:{spec.name}")
        fields.append({"spec": spec, "suffix_ids": suffix_ids, "label_ids": label_ids})
    return {"prefix_ids": prefix_ids, "fields": fields}


class MlxDecisionEngine:
    def __init__(self, snapshot_path: str, model_evidence: dict, max_prompt_tokens: int = MAX_PROMPT_TOKENS):
        self.snapshot_path = snapshot_path
        self.model_evidence = dict(model_evidence)
        if self.model_evidence.get("engineVersion") != ENGINE_VERSION:
            raise EngineError("engine_version_mismatch", str(self.model_evidence.get("engineVersion")))
        self.max_prompt_tokens = max_prompt_tokens
        self.model = None
        self.tokenizer = None
        self.load_ms: float | None = None
        self.warmup_report: dict | None = None
        self.batched_trusted = False
        self._mx = None
        self._make_prompt_cache = None
        self.pad_id = 0

    # ---- lifecycle ---------------------------------------------------------

    def load(self) -> None:
        started = time.perf_counter()
        import mlx.core as mx
        from mlx_lm import load
        from mlx_lm.models.cache import make_prompt_cache

        self._mx = mx
        self._make_prompt_cache = make_prompt_cache
        # Local path only; remote code is never trusted for the tokenizer, and
        # mlx-lm's own model classes (not repo code) implement the architecture.
        model, tokenizer = load(self.snapshot_path, tokenizer_config={"trust_remote_code": False})
        # Quantized weights stay 4-bit; activations run in float32. Measured on
        # Apple Silicon, bf16 activations made the batched and reference paths
        # disagree by up to ~7e-3 in probability (kernel/shape variance, argmax
        # unchanged); float32 brings the gap under 1e-5 at roughly 2x latency,
        # which stays inside the request budget.
        self.compute_dtype = "float32"
        try:
            model.set_dtype(mx.float32)
        except Exception as error:  # noqa: BLE001 - keep the model usable; agreement check decides trust
            self.compute_dtype = f"default({type(error).__name__})"
        self.model = model
        self.tokenizer = tokenizer
        pad = getattr(tokenizer, "pad_token_id", None)
        self.pad_id = int(pad) if isinstance(pad, int) and pad >= 0 else 0
        self.load_ms = (time.perf_counter() - started) * 1000.0

    def warmup(self) -> dict:
        """Synthetic input through both paths; the batched path is trusted only on agreement."""
        decision_input = synthetic_input()
        plan = plan_prompt(self.tokenizer, decision_input)
        sequential = self._score(plan, "sequential")
        batched = self._score(plan, "batched")
        max_abs = 0.0
        argmax_equal = True
        for left, right in zip(sequential["probs"], batched["probs"]):
            for a, b in zip(left, right):
                max_abs = max(max_abs, abs(a - b))
            if left.index(max(left)) != right.index(max(right)):
                argmax_equal = False
        self.batched_trusted = max_abs <= AGREEMENT_TOLERANCE and argmax_equal
        peak = None
        for name in ("get_peak_memory",):
            getter = getattr(self._mx, name, None)
            if callable(getter):
                try:
                    peak = int(getter())
                except Exception:  # noqa: BLE001
                    peak = None
        self.warmup_report = {
            "sequentialInferenceMs": sequential["inference_ms"],
            "batchedInferenceMs": batched["inference_ms"],
            "sequentialForwardPasses": sequential["forward_passes"],
            "batchedForwardPasses": batched["forward_passes"],
            "sequentialProcessedTokens": sequential["processed_tokens"],
            "batchedProcessedTokens": batched["processed_tokens"],
            "maxAbsProbabilityDiff": max_abs,
            "argmaxEqual": argmax_equal,
            "batchedTrusted": self.batched_trusted,
            "agreementTolerance": AGREEMENT_TOLERANCE,
            "peakMemoryBytes": peak,
            "loadMs": self.load_ms,
            "computeDtype": self.compute_dtype,
        }
        return self.warmup_report

    # ---- inference ---------------------------------------------------------

    def infer(self, decision_input: dict, path: str | None = None) -> dict:
        started = time.perf_counter()
        request_id = decision_input["requestId"]
        try:
            plan = plan_prompt(self.tokenizer, decision_input)
        except TokenizationError:
            return {"status": "abstain", "requestId": request_id, "reason": "unsupported_tokenization"}
        longest = len(plan["prefix_ids"]) + max(len(f["suffix_ids"]) for f in plan["fields"])
        if longest > self.max_prompt_tokens:
            return {"status": "abstain", "requestId": request_id, "reason": "invalid_request"}
        chosen = path or ("batched" if self.batched_trusted else "sequential")
        scored = self._score(plan, chosen)
        fields = {}
        for field, probs in zip(plan["fields"], scored["probs"]):
            fields[field["spec"].name] = field_result(field["spec"].values, probs)
        total_ms = (time.perf_counter() - started) * 1000.0
        return {
            "status": "ok",
            "requestId": request_id,
            "scope": dict(decision_input["scope"]),
            "kind": decision_input["kind"],
            "fields": fields,
            "model": dict(self.model_evidence),
            "timing": {
                "queueMs": 0.0,
                "inferenceMs": scored["inference_ms"],
                "totalMs": total_ms,
                "coldStart": self.warmup_report is None,
            },
            "compute": {
                "inputTokens": scored["processed_tokens"],
                "inputTokenEvidence": f"processed_prompt_tokens:tokenizer:{self.model_evidence.get('tokenizerDigest')}",
                "forwardPasses": scored["forward_passes"],
                "sharedPrefill": chosen == "batched",
            },
        }

    def score_paths(self, decision_input: dict) -> dict:
        """Both paths on one input (benchmark/verification helper)."""
        plan = plan_prompt(self.tokenizer, decision_input)
        return {"sequential": self._score(plan, "sequential"), "batched": self._score(plan, "batched")}

    def _score(self, plan: dict, path: str) -> dict:
        if path == "sequential":
            return self._score_sequential(plan)
        if path == "batched":
            return self._score_batched(plan)
        raise EngineError("unknown_path", path)

    def _candidate_logits(self, last_logits: Any, label_ids: list[int]) -> list[float]:
        row = last_logits.astype(self._mx.float32)
        return [float(row[tid]) for tid in label_ids]

    def _score_sequential(self, plan: dict) -> dict:
        mx = self._mx
        started = time.perf_counter()
        probs = []
        processed = 0
        for field in plan["fields"]:
            ids = plan["prefix_ids"] + field["suffix_ids"]
            cache = self._make_prompt_cache(self.model)
            logits = self.model(mx.array(ids, dtype=mx.int32)[None], cache=cache)
            mx.eval(logits)
            probs.append(candidate_probs(self._candidate_logits(logits[0, -1, :], field["label_ids"])))
            processed += len(ids)
        return {
            "probs": probs,
            "inference_ms": (time.perf_counter() - started) * 1000.0,
            "forward_passes": len(plan["fields"]),
            "processed_tokens": processed,
            "shared_prefill": False,
        }

    def _score_batched(self, plan: dict) -> dict:
        mx = self._mx
        started = time.perf_counter()
        prefix = plan["prefix_ids"]
        fields = plan["fields"]
        batch = len(fields)
        # 1. shared prefix prefill into a fresh, request-owned cache
        cache = self._make_prompt_cache(self.model)
        self.model(mx.array(prefix, dtype=mx.int32)[None], cache=cache)
        mx.eval([c.state for c in cache])
        # 2. broadcast the cache across the field batch (independent copies of the buffers)
        broadcast = []
        for layer in cache:
            clone = copy.copy(layer)
            if getattr(layer, "keys", None) is not None:
                clone.keys = mx.repeat(layer.keys, batch, axis=0)
                clone.values = mx.repeat(layer.values, batch, axis=0)
            broadcast.append(clone)
        # 3. right-padded suffix batch; each row's decision position is its own last real token
        lengths = [len(f["suffix_ids"]) for f in fields]
        width = max(lengths)
        rows = [f["suffix_ids"] + [self.pad_id] * (width - len(f["suffix_ids"])) for f in fields]
        logits = self.model(mx.array(rows, dtype=mx.int32), cache=broadcast)
        mx.eval(logits)
        probs = []
        for index, field in enumerate(fields):
            last = logits[index, lengths[index] - 1, :]
            probs.append(candidate_probs(self._candidate_logits(last, field["label_ids"])))
        return {
            "probs": probs,
            "inference_ms": (time.perf_counter() - started) * 1000.0,
            "forward_passes": 2,
            "processed_tokens": len(prefix) + sum(lengths),
            "shared_prefill": True,
            "padded_positions": batch * width,
        }
