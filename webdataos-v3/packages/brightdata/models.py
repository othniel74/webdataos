from typing import Any
from pydantic import BaseModel, Field
from packages.schemas.common import ToolName


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str | None = None
    rank: int | None = None


class BrightDataResult(BaseModel):
    tool: ToolName
    url: str | None = None
    query: str | None = None
    status_code: int | None = None
    text: str | None = None
    json_data: dict[str, Any] | list[Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
