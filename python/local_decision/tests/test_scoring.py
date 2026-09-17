import math
import unittest

from sks_local_decision.scoring import argmax_first, candidate_probs, field_result, margin_of


class ScoringTests(unittest.TestCase):
    def test_large_logits_are_stable(self):
        values = candidate_probs([1000.0, 1001.0])
        self.assertAlmostEqual(sum(values), 1.0, places=12)
        self.assertGreater(values[1], values[0])
        self.assertTrue(all(math.isfinite(x) for x in values))

    def test_nonfinite_rejected(self):
        for bad in [math.nan, math.inf, -math.inf]:
            with self.assertRaises(ValueError):
                candidate_probs([0.0, bad])

    def test_empty_rejected(self):
        with self.assertRaises(ValueError):
            candidate_probs([])

    def test_single_candidate_rejected(self):
        with self.assertRaises(ValueError):
            candidate_probs([3.0])

    def test_sum_within_tolerance_for_many_candidates(self):
        values = candidate_probs([-50.0, 0.0, 12.5, 12.5, 3.0])
        self.assertLessEqual(abs(sum(values) - 1.0), 1e-9)
        self.assertEqual(argmax_first(values), 2)
        self.assertLessEqual(abs(margin_of(values)), 1e-12)

    def test_field_result_shape(self):
        result = field_result(("a", "b", "c"), candidate_probs([1.0, 3.0, 0.0]))
        self.assertEqual(result["value"], "b")
        self.assertEqual([c["value"] for c in result["choices"]], ["a", "b", "c"])
        self.assertEqual(result["calibrationStatus"], "uncalibrated")
        ordered = sorted((c["candidateProbability"] for c in result["choices"]), reverse=True)
        self.assertAlmostEqual(result["margin"], ordered[0] - ordered[1], places=12)
        with self.assertRaises(ValueError):
            field_result(("a", "b"), [0.5, 0.25, 0.25])


if __name__ == "__main__":
    unittest.main()
