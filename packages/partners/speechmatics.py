from __future__ import annotations

import uuid
from packages.common.config import get_settings
from packages.schemas.partners import TranscriptionRequest, TranscriptionResult


class SpeechmaticsService:
    """Speechmatics adapter.

    The default implementation is mock-safe for local demos. Replace `_mock_transcribe`
    with the Speechmatics real-time/batch API call when credentials are provided.
    """

    def __init__(self) -> None:
        self.settings = get_settings()

    async def transcribe(self, request: TranscriptionRequest) -> TranscriptionResult:
        text = request.mock_text or self._mock_transcribe(request)
        return TranscriptionResult(
            transcript_id=f"tr_{uuid.uuid4().hex[:12]}",
            text=text,
            language=request.language,
            confidence=0.92,
            speaker_labels=["speaker_1"],
        )

    def _mock_transcribe(self, request: TranscriptionRequest) -> str:
        source = request.audio_url or request.audio_file_id or "uploaded audio"
        return f"Transcribed request from {source}: identify material enterprise signals, verify them with live web evidence, and trigger follow-up workflow actions where needed."
