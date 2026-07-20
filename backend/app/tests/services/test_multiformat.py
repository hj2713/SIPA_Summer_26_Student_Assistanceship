"""Unit tests for multi-format support logic using local SQLite mocks.
"""
import json
from unittest.mock import MagicMock, patch
import pytest
from app.core.config import settings
from app.services.ingestion_service import extract_text, process_document_background


@patch("docling.document_converter.DocumentConverter")
def test_extract_text_pdf_with_docling_enabled(mock_converter_cls, monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_DOCLING_EXTRACTION", True)
    mock_converter = MagicMock()
    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = "This is a PDF mock content."
    mock_converter.convert.return_value = mock_result
    mock_converter_cls.return_value = mock_converter
    
    content = b"PDF bytes"
    result = extract_text(content, "application/pdf", "test.pdf")
    assert result == "This is a PDF mock content."
    mock_converter.convert.assert_called_once()


@patch("docling.document_converter.DocumentConverter")
def test_extract_text_docx_with_docling_enabled(mock_converter_cls, monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_DOCLING_EXTRACTION", True)
    mock_converter = MagicMock()
    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = "This is a DOCX mock content."
    mock_converter.convert.return_value = mock_result
    mock_converter_cls.return_value = mock_converter
    
    content = b"DOCX bytes"
    result = extract_text(content, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "test.docx")
    assert result == "This is a DOCX mock content."
    mock_converter.convert.assert_called_once()


@patch("docling.document_converter.DocumentConverter")
def test_extract_text_markdown(mock_converter_cls):
    mock_converter = MagicMock()
    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = "This is a Markdown mock content."
    mock_converter.convert.return_value = mock_result
    mock_converter_cls.return_value = mock_converter
    
    content = b"Markdown bytes"
    result = extract_text(content, "text/markdown", "test.md")
    assert result == "Markdown bytes"
    mock_converter.convert.assert_not_called()


@patch("docling.document_converter.DocumentConverter")
def test_extract_text_empty_fails_with_docling_enabled(mock_converter_cls, monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_DOCLING_EXTRACTION", True)
    mock_converter = MagicMock()
    mock_result = MagicMock()
    mock_result.document.export_to_markdown.return_value = ""
    mock_converter.convert.return_value = mock_result
    mock_converter_cls.return_value = mock_converter
    
    content = b"empty"
    with pytest.raises(ValueError) as excinfo:
        extract_text(content, "application/pdf", "test.pdf")
    assert "Docling extracted no text" in str(excinfo.value)


def test_extract_text_pdf_disabled_fails_without_importing_docling():
    with pytest.raises(ValueError) as excinfo:
        extract_text(b"PDF bytes", "application/pdf", "test.pdf")
    assert "ENABLE_DOCLING_EXTRACTION=true" in str(excinfo.value)





@patch("app.services.ingestion_service.extract_text")
@patch("app.services.ingestion_service.extract_metadata_from_text")
@patch("app.services.ingestion_service.chunk_text")
@patch("app.services.ingestion_service.generate_embeddings")
@patch("app.services.ingestion_service.get_db_conn")
@patch("app.services.ingestion_service.update_document_status")
def test_process_document_background_passes_filename(
    mock_update_status,
    mock_get_db,
    mock_gen_embeddings,
    mock_chunk_text,
    mock_extract_metadata,
    mock_extract_text,
):
    mock_extract_text.return_value = "Extracted text content."
    mock_extract_metadata.return_value = {"title": "Test Title"}
    mock_chunk_text.return_value = ["chunk 1"]
    mock_gen_embeddings.return_value = [[0.1] * 1536]
    
    mock_conn = MagicMock()
    mock_get_db.return_value.__enter__.return_value = mock_conn
    
    process_document_background(
        doc_id="doc-id",
        user_id="user-id",
        filename="test_doc.pdf",
        content=b"pdf bytes",
        content_type="application/pdf"
    )
    
    mock_extract_text.assert_called_once_with(b"pdf bytes", "application/pdf", filename="test_doc.pdf")
