import time
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.models import AgentRun, AutonomousAction, OrganizationalContext
from packages.agents.planner import ResearchPlanner
from packages.agents.synthesizer import ReportSynthesizer
from packages.intelligence.service import IntelligenceService
from packages.llm.client import LLMClient
from packages.memory.provider import MemoryProvider
from packages.observability.metrics import AGENT_RUN_DURATION, AGENT_RUNS
from packages.partners.speechmatics import SpeechmaticsService
from packages.partners.triggerware import TriggerWareService
from packages.reasoning.engine import ReasoningEngine
from packages.schemas.agent import ResearchReport, ResearchRequest
from packages.schemas.intelligence import RetrievalRequest
from packages.schemas.partners import MemorySearchRequest, MemoryUpsertRequest, TranscriptionRequest, WorkflowTriggerRequest
from packages.schemas.reasoning import OrgContextRead


class ResearchAgentOrchestrator:
    def __init__(
        self,
        intelligence: IntelligenceService | None = None,
        speechmatics: SpeechmaticsService | None = None,
        memory: MemoryProvider | None = None,
        triggerware: TriggerWareService | None = None,
        reasoning: ReasoningEngine | None = None,
        llm: LLMClient | None = None,
    ) -> None:
        self.intelligence = intelligence or IntelligenceService()
        self.speechmatics = speechmatics or SpeechmaticsService()
        self.memory = memory or MemoryProvider()
        self.triggerware = triggerware or TriggerWareService()
        self.reasoning = reasoning or ReasoningEngine()
        self.llm = llm or LLMClient()
        self.planner = ResearchPlanner()
        self.synthesizer = ReportSynthesizer(llm=self.llm)

    async def run(self, db: AsyncSession, request: ResearchRequest) -> ResearchReport:
        start = time.perf_counter()
        run_id = str(uuid.uuid4())
        plan = self.planner.plan(request.task)
        topic_id = request.workspace_id or request.topic_id
        partner_trace: list[str] = []
        transcript = None
        memories = []
        workflow_events = []
        task_text = request.task
        try:
            if request.input_mode in {"voice", "audio_upload"} or request.audio_url:
                transcript = await self.speechmatics.transcribe(
                    TranscriptionRequest(
                        audio_url=request.audio_url,
                        mock_text=request.transcript_text,
                    )
                )
                task_text = f"{request.task}\n\nTranscript:\n{transcript.text}"
                partner_trace.append("speechmatics.transcribe")

            if request.enable_memory:
                memories = await self.memory.search(
                    db,
                    MemorySearchRequest(
                        workspace_id=topic_id,
                        query=task_text,
                        entities=[],
                        top_k=5,
                    )
                )
                partner_trace.append(f"memory.search({self.memory.provider_name})")

            retrieval = await self.intelligence.retrieve_context(
                db,
                RetrievalRequest(
                    query=task_text,
                    topic_id=topic_id,
                    freshness_required_days=request.freshness_required_days,
                    top_k=request.max_sources,
                ),
            )
            records = [r.record for r in retrieval if r.score > 0.25]

            if len(records) < 3:
                await self.intelligence.refresh_topic(db, topic_id, max_sources=request.max_sources)
                partner_trace.append("brightdata.gateway.refresh")
                retrieval = await self.intelligence.retrieve_context(
                    db,
                    RetrievalRequest(
                        query=task_text,
                        topic_id=topic_id,
                        freshness_required_days=request.freshness_required_days,
                        top_k=request.max_sources,
                    ),
                )
                records = [r.record for r in retrieval]

            summary, findings, companies, changes, confidence = await self.synthesizer.synthesize_async(
                task_text, records, memories
            )
            if self.llm.available:
                provider = self.llm.last_provider or self.llm.provider or "llm"
                partner_trace.append(f"{provider}.chat.synthesis")

            # ── Phase 1+2: Load org context and run reasoning engine ──
            org_context = await self._load_org_context(db, topic_id)
            reasoning_output = None
            action_proposals = []
            org_context_used = org_context is not None

            if records:
                reasoning_output = await self.reasoning.reason(
                    package_id=request.package_id,
                    records=records,
                    org_context=org_context,
                    memories=memories,
                    changes=changes,
                )
                partner_trace.append("reasoning.engine.analyze")

                # Use reasoning executive summary if available
                if reasoning_output.executive_summary:
                    summary = reasoning_output.executive_summary

                # Use reasoning confidence if higher
                if reasoning_output.confidence > confidence:
                    confidence = reasoning_output.confidence

                # ── Phase 3: Generate autonomous action proposals ──
                action_proposals = self.reasoning.propose_actions(reasoning_output, topic_id)
                partner_trace.append(f"reasoning.actions.proposed({len(action_proposals)})")

                # Store proposed actions in DB
                for proposal in action_proposals:
                    db.add(AutonomousAction(
                        id=str(uuid.uuid4()),
                        workspace_id=topic_id,
                        run_id=run_id,
                        recommendation_id=proposal.recommendation_id,
                        action_type=proposal.action_type,
                        status="pending_approval" if proposal.requires_approval else "auto_approved",
                        title=proposal.title,
                        description=proposal.description,
                        payload=proposal.payload,
                    ))

            if request.enable_memory:
                memory = await self.memory.upsert(
                    db,
                    MemoryUpsertRequest(
                        workspace_id=topic_id,
                        entity=request.package_id,
                        content=summary,
                        evidence_urls=list(dict.fromkeys([r.source_url for r in records])),
                        metadata={"run_id": run_id, "package_id": request.package_id},
                    )
                )
                memories = [memory, *memories]
                partner_trace.append(f"memory.upsert({self.memory.provider_name})")

            if request.enable_workflows:
                # Use reasoning-based severity if available
                if reasoning_output and reasoning_output.risk_posture in {"critical", "degrading"}:
                    severity = "high"
                else:
                    severity = "high" if confidence < 0.55 or any("risk" in f.lower() for f in findings) else "medium"
                event = await self.triggerware.trigger(
                    WorkflowTriggerRequest(
                        workspace_id=topic_id,
                        event_type="intelligence_signal",
                        summary=summary,
                        severity=severity,
                        payload={"run_id": run_id, "package_id": request.package_id, "findings": findings},
                    )
                )
                workflow_events.append(event)
                partner_trace.append("triggerware.workflow.trigger")

            report = ResearchReport(
                run_id=run_id,
                task=request.task,
                workspace_id=topic_id,
                package_id=request.package_id,
                summary=summary,
                key_findings=findings,
                companies=companies,
                recent_changes=changes,
                sources=list(dict.fromkeys([r.source_url for r in records])),
                records_used=records,
                transcript=transcript,
                memories_used=memories,
                workflow_events=workflow_events,
                partner_trace=partner_trace,
                confidence=confidence,
                plan=plan,
                reasoning=reasoning_output.model_dump() if reasoning_output else None,
                autonomous_actions=[p.model_dump() for p in action_proposals],
                org_context_used=org_context_used,
            )
            db.add(AgentRun(id=run_id, topic_id=topic_id, task=request.task, status="success", report_json=report.model_dump()))
            await db.commit()
            AGENT_RUNS.labels(status="success").inc()
            return report
        except Exception:
            AGENT_RUNS.labels(status="failed").inc()
            raise
        finally:
            AGENT_RUN_DURATION.observe(time.perf_counter() - start)

    async def _load_org_context(self, db: AsyncSession, workspace_id: str) -> OrgContextRead | None:
        """Load organizational context for the workspace if it exists."""
        result = await db.execute(
            select(OrganizationalContext).where(OrganizationalContext.workspace_id == workspace_id)
        )
        ctx = result.scalar_one_or_none()
        if not ctx:
            return None
        return OrgContextRead(
            id=ctx.id,
            workspace_id=ctx.workspace_id,
            contracts=ctx.contracts or [],
            risk_thresholds=ctx.risk_thresholds or {},
            financial_exposure=ctx.financial_exposure or {},
            renewal_calendar=ctx.renewal_calendar or [],
            strategic_priorities=ctx.strategic_priorities or [],
            compliance_requirements=ctx.compliance_requirements or [],
            created_at=str(ctx.created_at) if ctx.created_at else None,
            updated_at=str(ctx.updated_at) if ctx.updated_at else None,
        )
