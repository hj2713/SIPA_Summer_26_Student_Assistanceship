import pytest
from unittest.mock import MagicMock, patch
from app.services.ingestion_service import extract_text, chunk_text

@patch("docling.document_converter.DocumentConverter")
def test_extract_text_plain_text(mock_converter_cls):
    mock_converter = MagicMock()
    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = "Hello, this is plain text."
    mock_converter.convert.return_value = mock_result
    mock_converter_cls.return_value = mock_converter

    content = b"Hello, this is plain text."
    result = extract_text(content, "text/plain")
    assert result == "Hello, this is plain text."
    mock_converter.convert.assert_not_called()


@patch("docling.document_converter.DocumentConverter")
def test_extract_text_markdown(mock_converter_cls):
    mock_converter = MagicMock()
    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = "# Header\n\nSome **bold** markdown content."
    mock_converter.convert.return_value = mock_result
    mock_converter_cls.return_value = mock_converter

    content = b"# Header\n\nSome **bold** markdown content."
    result = extract_text(content, "text/markdown")
    assert "# Header" in result
    assert "Some **bold** markdown content." in result
    mock_converter.convert.assert_called_once()


@patch("docling.document_converter.DocumentConverter")
def test_extract_text_html(mock_converter_cls):
    mock_converter = MagicMock()
    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = "# Hello World\n\nWelcome to RAG."
    mock_converter.convert.return_value = mock_result
    mock_converter_cls.return_value = mock_converter

    content = b"<html><body><h1>Hello World</h1><p>Welcome to RAG.</p></body></html>"
    result = extract_text(content, "text/html")
    assert "Hello World" in result
    assert "Welcome to RAG." in result
    mock_converter.convert.assert_called_once()


@patch("docling.document_converter.DocumentConverter")
def test_extract_text_unsupported(mock_converter_cls):
    mock_converter = MagicMock()
    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = ""
    mock_converter.convert.return_value = mock_result
    mock_converter_cls.return_value = mock_converter

    content = b"\xff\xfe\xfd\xfc"
    with pytest.raises(ValueError) as excinfo:
        extract_text(content, "application/pdf")
    assert "Docling extracted no text" in str(excinfo.value)


def test_chunk_text_empty():
    assert chunk_text("") == []
    assert chunk_text("   ") == []


def test_chunk_text_short():
    text = "Short text."
    chunks = chunk_text(text, chunk_size=100)
    assert len(chunks) == 1
    assert chunks[0] == "Short text."


def test_chunk_text_paragraph_split():
    text = "Paragraph one.\n\nParagraph two.\n\nParagraph three."
    # With a small chunk size that fits paragraphs but not multiple together
    chunks = chunk_text(text, chunk_size=20, overlap=5)
    assert len(chunks) == 3
    assert chunks[0] == "Paragraph one."
    assert chunks[1] == "Paragraph two."
    assert chunks[2] == "Paragraph three."


def test_chunk_text_long_sentence_fallback():
    # A single very long paragraph with no newlines
    text = "This is sentence one. This is a very long sentence two that will exceed the size. This is sentence three."
    chunks = chunk_text(text, chunk_size=40, overlap=10)
    # It should split by sentence boundary where possible, or character if it can't fit
    assert len(chunks) >= 2
    # Ensure all original content is preserved somewhere
    full_reconstructed = " ".join(chunks)
    assert "sentence one" in full_reconstructed
    assert "sentence two" in full_reconstructed
    assert "sentence three" in full_reconstructed
