from __future__ import annotations

import asyncio
import json
import uuid

import httpx

from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.schemas.partners import TranscriptionRequest, TranscriptionResult

logger = get_logger(__name__)
DEFAULT_ENDPOINT = "https://asr.api.speechmatics.com/v2/jobs"


class SpeechmaticsService:
    """Speechmatics adapter.

    Uses Speechmatics Batch SaaS when an API key and audio URL are provided.
    Otherwise remains mock-safe for local demos and typed transcript input.
    """

    def __init__(self) -> None:
        self.settings = get_settings()

    async def transcribe(self, request: TranscriptionRequest) -> TranscriptionResult:
        if request.mock_text:
            text = request.mock_text
        elif self.settings.speechmatics_api_key and request.audio_url:
            return await self._transcribe_audio_url(request)
        else:
            text = self._mock_transcribe(request)
        return TranscriptionResult(
            transcript_id=f"tr_{uuid.uuid4().hex[:12]}",
            text=text,
            language=request.language,
            confidence=0.92,
            speaker_labels=["speaker_1"],
        )

    async def _transcribe_audio_url(self, request: TranscriptionRequest) -> TranscriptionResult:
        config = {
            "type": "transcription",
            "transcription_config": {
                "language": request.language,
                "diarization": "speaker",
            },
            "fetch_data": {"url": request.audio_url},
        }
        headers = {"Authorization": f"Bearer {self.settings.speechmatics_api_key}"}
        endpoint = self.settings.speechmatics_endpoint or DEFAULT_ENDPOINT
        async with httpx.AsyncClient(timeout=60.0) as client:
            create = await client.post(
                endpoint,
                headers=headers,
                files={"config": (None, json.dumps(config), "application/json")},
            )
            create.raise_for_status()
            data = create.json()
            job_id = data.get("id") or data.get("job", {}).get("id")
            if not job_id:
                raise RuntimeError("Speechmatics did not return a job id")

            job_url = f"{endpoint.rstrip('/')}/{job_id}"
            transcript_url = f"{job_url}/transcript"
            for _ in range(self.settings.speechmatics_poll_attempts):
                status_response = await client.get(job_url, headers=headers)
                status_response.raise_for_status()
                status_data = status_response.json()
                status = (status_data.get("job", {}).get("status") or status_data.get("status") or "").lower()
                if status in {"done", "completed"}:
                    transcript = await client.get(
                        transcript_url,
                        headers=headers,
                        params={"format": "txt"},
                    )
                    transcript.raise_for_status()
                    text = transcript.text.strip()
                    return TranscriptionResult(
                        transcript_id=str(job_id),
                        text=text,
                        language=request.language,
                        confidence=0.95,
                        speaker_labels=["speaker_1"],
                    )
                if status in {"rejected", "failed", "error"}:
                    raise RuntimeError(f"Speechmatics job {job_id} failed with status {status}")
                await asyncio.sleep(self.settings.speechmatics_poll_interval_seconds)

        raise TimeoutError(f"Speechmatics job {job_id} did not complete in time")

    def _mock_transcribe(self, request: TranscriptionRequest) -> str:
        source = request.audio_url or request.audio_file_id or "uploaded audio"
        if self.settings.speechmatics_api_key and not request.audio_url:
            logger.info("speechmatics_key_present_but_no_audio_url", source=source)
        return f"Transcribed request from {source}: identify material enterprise signals, verify them with live web evidence, and trigger follow-up workflow actions where needed."
