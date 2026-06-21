import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

def quantize_to_int8(vector: list[float]) -> bytes:
    """Quantize Float32 vector coordinate elements to Int8 bytes (values offset to [0, 255])."""
    # Scale from [-1.0, 1.0] to [-127, 127], offset to [0, 255]
    quantized = [max(-128, min(127, round(x * 127))) for x in vector]
    unsigned = [x + 128 for x in quantized]
    return bytes(unsigned)

def dequantize_from_int8(b: bytes) -> list[float]:
    """Dequantize Int8 bytes (values offset to [0, 255]) back to Float32 elements."""
    return [(x - 128) / 127.0 for x in b]

def serialize_embedding(vector: list[float]) -> bytes:
    """Convert float vector to binary Int8 BLOB."""
    if not vector:
        return b""
    return quantize_to_int8(vector)

def deserialize_embedding(val: Any) -> list[float]:
    """Robustly deserialize vector, supporting both new binary Int8 and old JSON strings/arrays."""
    if not val:
        return []
    if isinstance(val, bytes):
        return dequantize_from_int8(val)
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            # Fallback if it is stored as some other string or representation
            return []
    if isinstance(val, list):
        return val
    return []
