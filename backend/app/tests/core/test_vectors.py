import pytest
import math
from app.core.vectors import quantize_to_int8, dequantize_from_int8, serialize_embedding, deserialize_embedding

def test_quantization_dequantization_accuracy():
    # Test vector with values in [-1.0, 1.0]
    original = [0.0, 1.0, -1.0, 0.5, -0.25, 0.12345]
    
    # Quantize
    binary = quantize_to_int8(original)
    assert len(binary) == len(original)
    
    # Dequantize
    recovered = dequantize_from_int8(binary)
    assert len(recovered) == len(original)
    
    # Check max error (quantization to 256 levels should have max error < 1/127 ≈ 0.0078)
    for orig, rec in zip(original, recovered):
        assert abs(orig - rec) <= 1.0 / 127.0 + 1e-9

def test_cosine_similarity_retained():
    # Two vectors of length 384
    v1 = [math.sin(i) for i in range(384)]
    v2 = [math.cos(i) for i in range(384)]
    
    # Normalize them to unit length
    mag1 = math.sqrt(sum(x*x for x in v1))
    mag2 = math.sqrt(sum(x*x for x in v2))
    v1 = [x/mag1 for x in v1]
    v2 = [x/mag2 for x in v2]
    
    # Original similarity
    orig_sim = sum(x*y for x, y in zip(v1, v2))
    
    # Quantize and dequantize
    v1_rec = dequantize_from_int8(quantize_to_int8(v1))
    v2_rec = dequantize_from_int8(quantize_to_int8(v2))
    
    # Dequantized similarity
    mag1_rec = math.sqrt(sum(x*x for x in v1_rec))
    mag2_rec = math.sqrt(sum(x*x for x in v2_rec))
    v1_rec_norm = [x/mag1_rec for x in v1_rec]
    v2_rec_norm = [x/mag2_rec for x in v2_rec]
    
    rec_sim = sum(x*y for x, y in zip(v1_rec_norm, v2_rec_norm))
    
    # The cosine similarity should be extremely close (difference < 0.005)
    assert abs(orig_sim - rec_sim) < 0.005

def test_serialize_deserialize():
    original = [0.1, -0.2, 0.3]
    
    # Test binary path
    serialized = serialize_embedding(original)
    assert isinstance(serialized, bytes)
    
    deserialized = deserialize_embedding(serialized)
    assert len(deserialized) == len(original)
    for o, d in zip(original, deserialized):
        assert abs(o - d) <= 1.0 / 127.0
        
    # Test empty input
    assert serialize_embedding([]) == b""
    assert deserialize_embedding(None) == []
    assert deserialize_embedding(b"") == []
    
    # Test JSON string fallback path
    json_str = "[0.1, -0.2, 0.3]"
    deserialized_json = deserialize_embedding(json_str)
    assert deserialized_json == [0.1, -0.2, 0.3]
    
    # Test invalid string gracefully handled
    assert deserialize_embedding("invalid-json") == []
    
    # Test list fallback
    assert deserialize_embedding([0.1, -0.2, 0.3]) == [0.1, -0.2, 0.3]
