"""Pure scoring helpers. No MLX import: verifiable on any CPU."""

from __future__ import annotations

import math
from typing import Sequence


def candidate_probs(logits: Sequence[float]) -> list[float]:
    """Stable softmax over a bounded candidate set.

    Requires at least two finite logits. NaN/Infinity, a single candidate, and an
    empty input are ValueError: a probability over one candidate is not a decision.
    The result is a candidate-relative distribution, not a calibrated correctness
    probability (design §6.4).
    """
    values = [float(v) for v in logits]
    if len(values) < 2:
        raise ValueError("candidate_probs requires at least two candidates")
    for v in values:
        if not math.isfinite(v):
            raise ValueError("candidate_probs requires finite logits")
    peak = max(values)
    exps = [math.exp(v - peak) for v in values]
    total = sum(exps)
    if not math.isfinite(total) or total <= 0.0:
        raise ValueError("candidate_probs normalization failed")
    probs = [e / total for e in exps]
    # Renormalize once in float64 so the sum is exact to well under 1e-6.
    correction = sum(probs)
    return [p / correction for p in probs]


def argmax_first(probs: Sequence[float]) -> int:
    """Tie policy: the lowest index among equal maxima (shared by both engine paths)."""
    best = 0
    for index in range(1, len(probs)):
        if probs[index] > probs[best]:
            best = index
    return best


def margin_of(probs: Sequence[float]) -> float:
    ordered = sorted(probs, reverse=True)
    return float(ordered[0] - ordered[1])


def field_result(values: Sequence[str], probs: Sequence[float]) -> dict:
    if len(values) != len(probs):
        raise ValueError("field_result value/probability length mismatch")
    winner = argmax_first(probs)
    return {
        "value": values[winner],
        "choices": [
            {"value": value, "candidateProbability": float(prob)}
            for value, prob in zip(values, probs)
        ],
        "calibrationStatus": "uncalibrated",
        "margin": margin_of(probs),
    }
