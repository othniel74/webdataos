from pydantic import BaseModel, Field


class IntelligencePackRead(BaseModel):
    id: str
    name: str
    tier: str
    description: str
    entities: list[str] = Field(default_factory=list)
    signals: list[str] = Field(default_factory=list)
    brightdata_routes: list[str] = Field(default_factory=list)
    input_channels: list[str] = Field(default_factory=list)
    partner_routes: list[str] = Field(default_factory=list)
    output_focus: list[str] = Field(default_factory=list)


class WorkspaceCreate(BaseModel):
    id: str | None = None
    name: str
    package_id: str = "enterprise"
    description: str | None = None
    entities: list[str] = Field(default_factory=list)
    signals: list[str] = Field(default_factory=list)
    refresh_frequency_minutes: int = Field(default=1440, ge=15, le=43200)
    input_channels: list[str] = Field(default_factory=lambda: ["text", "voice", "audio_upload"])
    partner_routes: list[str] = Field(default_factory=lambda: ["speechmatics", "cognee", "brightdata", "triggerware"])


class WorkspaceRead(BaseModel):
    id: str
    name: str
    package_id: str
    description: str | None = None
    entities: list[str] = Field(default_factory=list)
    signals: list[str] = Field(default_factory=list)
    brightdata_routes: list[str] = Field(default_factory=list)
    input_channels: list[str] = Field(default_factory=list)
    partner_routes: list[str] = Field(default_factory=list)
    refresh_frequency_minutes: int = 1440
    created_at: str | None = None
