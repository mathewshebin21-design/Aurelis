"""Deterministic quantitative engine.

All arithmetic uses `decimal.Decimal` in a fixed high-precision context, so
results are reproducible bit-for-bit and independent of float rounding.
Functions are pure: no I/O, no randomness, no clock. Undefined results
(zero or negative denominators, missing inputs) return `None`, never a
misleading number. The AI layer quotes these outputs; it never computes them.
"""

ENGINE_VERSION = "quant-1.0.0"
