import asyncio
import time
import uuid
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from apps.api.db.models import AgentRun, AutonomousAction, ChangeEvent, OrganizationalContext, Outcome, Topic
from packages.common.config import get_settings
from packages.agents.planner import ResearchPlanner
from packages.agents.synthesizer import ReportSynthesizer
from packages.intelligence.service import IntelligenceService
from packages.llm.client import LLMClient
from packages.memory.provider import MemoryProvider
from packages.observability.metrics import AGENT_RUN_DURATION, AGENT_RUNS
from packages.partners.speechmatics import SpeechmaticsService
from packages.partners.triggerware import TriggerWareService
from packages.reasoning.engine import ReasoningEngine
from packages.schemas.agent import ResearchReport, ResearchRequest, ResearchRunReceipt, ResearchRunStage
from packages.schemas.intelligence import RetrievalRequest
from packages.schemas.partners import MemorySearchRequest, MemoryUpsertRequest, TranscriptionRequest, WorkflowTriggerRequest
from packages.schemas.reasoning import ActionProposal, OrgContextRead


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
        self.settings = get_settings()

    async def run(self, db: AsyncSession, request: ResearchRequest) -> ResearchReport:
        start = time.perf_counter()
        run_id = str(uuid.uuid4())
        plan = self.planner.plan(request.task)
        topic_id = request.workspace_id or request.topic_id
        partner_trace: list[str] = []
        topic = await db.get(Topic, topic_id)
        topic_entities = topic.entities if topic and topic.entities else []
        tenant_id = topic.tenant_id if topic else "tenant_internal"
        previous_run_at = await self._previous_run_created_at(db, topic_id)
        previous_run_exists = previous_run_at is not None
        transcript = None
        memories = []
        workflow_events = []
        task_text = request.task
        retrieval_query = request.task
        if request.conversation_context:
            task_text = (
                f"Recent analyst conversation:\n{request.conversation_context.strip()}\n\n"
                f"Current user request:\n{request.task}"
            )
        stages: list[ResearchRunStage] = [
            ResearchRunStage(name="input", status="received", provider=request.input_mode, detail=request.task[:120]),
        ]
        try:
            if request.input_mode in {"voice", "audio_upload"} or request.audio_url:
                transcript = await self.speechmatics.transcribe(
                    TranscriptionRequest(
                        audio_url=request.audio_url,
                        mock_text=request.transcript_text,
                    )
                )
                task_text = f"{request.task}\n\nTranscript:\n{transcript.text}"
                retrieval_query = task_text
                partner_trace.append("speechmatics.transcribe")
                stages.append(
                    ResearchRunStage(
                        name="transcribe",
                        status="success",
                        provider="speechmatics",
                        detail=transcript.transcript_id,
                    )
                )
            else:
                stages.append(ResearchRunStage(name="transcribe", status="skipped", provider="speechmatics", detail="text input"))

            if request.enable_memory:
                memories = await self.memory.search(
                    db,
                    MemorySearchRequest(
                        workspace_id=topic_id,
                        query=task_text,
                        entities=topic_entities,
                        top_k=5,
                    )
                )
                partner_trace.append(f"memory.search({self.memory.provider_name})")
                stages.append(
                    ResearchRunStage(
                        name="memory_search",
                        status="success",
                        provider=self.memory.provider_name,
                        detail=f"{len(memories)} records",
                    )
                )
            else:
                stages.append(ResearchRunStage(name="memory_search", status="skipped", detail="disabled"))

            retrieval = await self.intelligence.retrieve_context(
                db,
                RetrievalRequest(
                    query=retrieval_query,
                    topic_id=topic_id,
                    freshness_required_days=request.freshness_required_days,
                    entities=topic_entities,
                    top_k=request.max_sources,
                ),
                tenant_id=tenant_id,
            )
            records = [
                r.record for r in retrieval
                if r.score >= 0.45 and "no_query_match" not in r.reasons
            ]
            stages.append(
                ResearchRunStage(
                    name="retrieve_context",
                    status="success",
                    provider="intelligence_records",
                    detail=f"{len(records)} query-matched records",
                )
            )

            if len(records) < 2:
                try:
                    refresh_limit = min(request.max_sources, 3)
                    refresh_result = await asyncio.wait_for(
                        self.intelligence.refresh_topic(
                            db,
                            topic_id,
                            max_sources=refresh_limit,
                            query=retrieval_query,
                            tenant_id=tenant_id,
                        ),
                        timeout=min(40, max(15, self.settings.request_timeout_seconds + 5)),
                    )
                    partner_trace.append(f"brightdata.gateway.refresh({refresh_limit},query_specific)")
                    refresh_status = refresh_result.get("status", "success")
                    refresh_detail = (
                        f"checked={refresh_result.get('sources_checked', 0)}, "
                        f"created={refresh_result.get('records_created', 0)}"
                    )
                    if refresh_result.get("error"):
                        refresh_detail = refresh_result["error"][:220]
                    stages.append(
                        ResearchRunStage(
                            name="brightdata_refresh",
                            status="success" if refresh_status == "success" else "failed",
                            provider="bright_data_gateway",
                            detail=refresh_detail,
                        )
                    )
                except TimeoutError:
                    partner_trace.append("brightdata.gateway.refresh_timeout")
                    stages.append(
                        ResearchRunStage(
                            name="brightdata_refresh",
                            status="timeout",
                            provider="bright_data_gateway",
                            detail=f"max_sources={refresh_limit}",
                        )
                    )
                retrieval = await self.intelligence.retrieve_context(
                    db,
                    RetrievalRequest(
                        query=retrieval_query,
                        topic_id=topic_id,
                        freshness_required_days=request.freshness_required_days,
                        entities=topic_entities,
                        top_k=request.max_sources,
                    ),
                    tenant_id=tenant_id,
                )
                records = [
                    r.record for r in retrieval
                    if r.score >= 0.40 and "no_query_match" not in r.reasons
                ]
                if not records:
                    fallback_records = await self.intelligence.list_records(
                        db,
                        topic_id=topic_id,
                        tenant_id=tenant_id,
                        include_stale=False,
                        freshness_required_days=request.freshness_required_days,
                    )
                    records = fallback_records[: request.max_sources]
                    stages.append(
                        ResearchRunStage(
                            name="baseline_evidence",
                            status="success" if records else "empty",
                            provider="intelligence_records",
                            detail=f"{len(records)} latest records used after narrow query match",
                        )
                    )

            summary, findings, companies, changes, confidence = await self.synthesizer.synthesize_async(
                task_text, records, memories
            )
            db_changes = await self._recent_changes(db, topic_id, since=previous_run_at)
            if self.llm.available:
                provider = self.llm.last_provider or self.llm.provider or "llm"
                partner_trace.append(f"{provider}.chat.synthesis")
                stages.append(
                    ResearchRunStage(name="synthesize", status="success", provider=provider, detail=f"confidence={confidence:.2f}")
                )
            else:
                stages.append(
                    ResearchRunStage(name="synthesize", status="fallback", provider="local_synthesizer", detail=f"confidence={confidence:.2f}")
                )

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
                stages.append(
                    ResearchRunStage(name="reason", status="success", provider="reasoning_engine", detail=reasoning_output.risk_posture)
                )

                # Use reasoning executive summary if available
                if reasoning_output.executive_summary:
                    summary = reasoning_output.executive_summary

                # Use reasoning confidence if higher
                if reasoning_output.confidence > confidence:
                    confidence = reasoning_output.confidence

                # ── Phase 3: Generate autonomous action proposals ──
                action_proposals = self.reasoning.propose_actions(reasoning_output, topic_id)
                if not action_proposals and records:
                    action_proposals = self._baseline_action_proposals(reasoning_output, records)
                partner_trace.append(f"reasoning.actions.proposed({len(action_proposals)})")
                stages.append(
                    ResearchRunStage(name="propose_actions", status="success", provider="reasoning_engine", detail=f"{len(action_proposals)} actions")
                )

                # Store proposed actions in DB
                for proposal in action_proposals:
                    db.add(AutonomousAction(
                        id=str(uuid.uuid4()),
                        tenant_id=tenant_id,
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
                stages.append(
                    ResearchRunStage(name="memory_upsert", status="success", provider=self.memory.provider_name, detail=memory.memory_id)
                )

            if request.enable_workflows:
                # Use reasoning-based severity if available
                if reasoning_output and reasoning_output.risk_posture in {"critical", "degrading"}:
                    severity = "high"
                else:
                    severity = "high" if confidence < 0.55 or any("risk" in f.lower() for f in findings) else "medium"
                workflow_context = self._workflow_context(
                    request.package_id,
                    action_proposals,
                    reasoning_output,
                    records,
                )
                event = await self.triggerware.trigger(
                    WorkflowTriggerRequest(
                        workspace_id=topic_id,
                        event_id=f"{run_id}:workflow",
                        run_id=run_id,
                        domain=workflow_context["domain"],
                        package_id=request.package_id,
                        event_type=workflow_context["event_type"],
                        signal_type=workflow_context["signal_type"],
                        entity_name=workflow_context["entity_name"],
                        summary=summary,
                        severity=severity,
                        recommended_action=workflow_context["recommended_action"],
                        evidence_urls=list(dict.fromkeys([r.source_url for r in records])),
                        payload={
                            "run_id": run_id,
                            "package_id": request.package_id,
                            "findings": findings,
                            "companies": companies,
                            "recent_changes": changes,
                            "recommendations": [r.model_dump() for r in reasoning_output.recommendations] if reasoning_output else [],
                            "autonomous_actions": [p.model_dump() for p in action_proposals],
                        },
                    )
                )
                workflow_events.append(event)
                partner_trace.append("triggerware.workflow.trigger")
                stages.append(
                    ResearchRunStage(name="workflow", status=event.status, provider="triggerware", detail=event.action)
                )
            else:
                stages.append(ResearchRunStage(name="workflow", status="skipped", provider="triggerware", detail="disabled"))

            fallbacks_used = []
            if "self_hosted" in self.memory.provider_name:
                fallbacks_used.append("self_hosted_memory")
            if not self.llm.available:
                fallbacks_used.append("local_synthesizer")
            outcome_count = await self._outcome_count(db, topic_id, run_id)
            value_loop = self._value_loop(
                topic=topic,
                records=records,
                db_changes=db_changes,
                reasoning_output=reasoning_output,
                action_proposals=action_proposals,
                workflow_events=workflow_events,
                outcome_count=outcome_count,
                previous_run_exists=previous_run_exists,
            )
            if records and not previous_run_exists and not db_changes:
                summary = f"Baseline created for {topic.name if topic else topic_id}. {summary}"
            elif records and previous_run_exists and not db_changes:
                summary = f"No material changes detected since the last monitoring cycle. {summary}"
            run_receipt = ResearchRunReceipt(
                run_id=run_id,
                status="success",
                input_mode=request.input_mode,
                stages=stages,
                value_loop=value_loop,
                providers={
                    "speechmatics": "speechmatics" if transcript else None,
                    "memory": self.memory.provider_name if request.enable_memory else None,
                    "retrieval": "bright_data_gateway",
                    "llm": (self.llm.last_provider or self.llm.provider) if self.llm.available else "local_synthesizer",
                    "workflow": "triggerware" if request.enable_workflows else None,
                },
                counts={
                    "sources": len({r.source_url for r in records}),
                    "records_used": len(records),
                    "changes_detected": len(db_changes),
                    "recommendations": len(reasoning_output.recommendations) if reasoning_output else 0,
                    "memories_used": len(memories),
                    "workflow_events": len(workflow_events),
                    "autonomous_actions": len(action_proposals),
                    "outcomes_recorded": outcome_count,
                },
                fallbacks_used=fallbacks_used,
                errors=[s.detail or s.name for s in stages if s.status in {"failed", "error", "timeout"}],
            )

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
                run_receipt=run_receipt,
            )
            db.add(AgentRun(id=run_id, tenant_id=tenant_id, topic_id=topic_id, task=request.task, status="success", report_json=report.model_dump()))
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

    async def _previous_run_created_at(self, db: AsyncSession, topic_id: str | None):
        if not topic_id:
            return None
        result = await db.execute(
            select(AgentRun.created_at)
            .where(AgentRun.topic_id == topic_id)
            .order_by(desc(AgentRun.created_at))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _recent_changes(self, db: AsyncSession, topic_id: str | None, since=None) -> list[dict]:
        if not topic_id:
            return []
        stmt = select(ChangeEvent).where(ChangeEvent.topic_id == topic_id)
        if since:
            stmt = stmt.where(ChangeEvent.detected_at >= since)
        result = await db.execute(
            stmt.order_by(desc(ChangeEvent.detected_at)).limit(12)
        )
        return [
            {
                "id": change.id,
                "record_id": change.record_id,
                "change_type": change.change_type,
                "field": change.field,
                "detected_at": str(change.detected_at) if change.detected_at else None,
            }
            for change in result.scalars().all()
        ]

    async def _outcome_count(self, db: AsyncSession, topic_id: str | None, run_id: str) -> int:
        if not topic_id:
            return 0
        result = await db.execute(
            select(Outcome.id).where(Outcome.workspace_id == topic_id, Outcome.run_id == run_id)
        )
        return len(result.scalars().all())

    def _baseline_action_proposals(self, reasoning_output, records: list) -> list[ActionProposal]:
        first = records[0]
        recommendation_id = None
        if reasoning_output and reasoning_output.recommendations:
            recommendation_id = reasoning_output.recommendations[0].id
        return [
            ActionProposal(
                action_type="review_monitoring_baseline",
                title=f"Review monitoring baseline: {first.entity_name or 'workspace'}",
                description=(
                    "Confirm whether the new evidence baseline is useful, then approve follow-up monitoring "
                    "or adjust entities and signals before the next cycle."
                ),
                payload={
                    "record_ids": [record.id for record in records[:8]],
                    "evidence_urls": list(dict.fromkeys([record.source_url for record in records[:8]])),
                    "loop_step": "baseline_review",
                },
                recommendation_id=recommendation_id,
                requires_approval=False,
                urgency="low",
            )
        ]

    def _value_loop(
        self,
        topic: Topic | None,
        records: list,
        db_changes: list[dict],
        reasoning_output,
        action_proposals: list,
        workflow_events: list,
        outcome_count: int,
        previous_run_exists: bool,
    ) -> list[dict]:
        entity_count = len(topic.entities or []) if topic else 0
        signal_count = len(topic.watch_types or []) if topic else 0
        reason_count = len(reasoning_output.materiality_assessments) if reasoning_output else 0
        recommendation_count = len(reasoning_output.recommendations) if reasoning_output else 0
        if db_changes:
            compare_status = "changed"
            compare_detail = f"{len(db_changes)} change events detected against saved evidence."
        elif previous_run_exists:
            compare_status = "no_change"
            compare_detail = "No material change detected against the previous saved state."
        elif records:
            compare_status = "baseline"
            compare_detail = "First successful run created the baseline for future comparisons."
        else:
            compare_status = "waiting"
            compare_detail = "No evidence baseline exists yet."
        return [
            {
                "step": "Monitor",
                "status": "configured" if topic else "missing",
                "detail": f"{entity_count} entities and {signal_count} signal types in scope.",
            },
            {
                "step": "Evidence",
                "status": "saved" if records else "empty",
                "detail": f"{len(records)} evidence records available for this run.",
            },
            {
                "step": "Compare",
                "status": compare_status,
                "detail": compare_detail,
            },
            {
                "step": "Reason",
                "status": "complete" if reasoning_output else "blocked",
                "detail": f"{reason_count} assessments and {recommendation_count} recommendations generated.",
            },
            {
                "step": "Act",
                "status": "ready" if action_proposals else "none",
                "detail": f"{len(action_proposals)} actions proposed; {len(workflow_events)} workflow events recorded.",
            },
            {
                "step": "Outcome",
                "status": "recorded" if outcome_count else "pending",
                "detail": f"{outcome_count} outcomes recorded for this run.",
            },
        ]

    def _workflow_context(self, package_id: str, action_proposals: list, reasoning_output, records: list) -> dict[str, str]:
        first_action = action_proposals[0] if action_proposals else None
        first_rec = reasoning_output.recommendations[0] if reasoning_output and reasoning_output.recommendations else None
        first_record = records[0] if records else None

        signal_type = first_action.action_type if first_action else "intelligence_signal"
        if first_rec and first_rec.framework_used:
            signal_type = first_rec.framework_used

        entity_name = ""
        if first_rec and first_rec.affected_entities:
            entity_name = first_rec.affected_entities[0]
        elif first_record:
            entity_name = first_record.entity_name

        recommended_action = ""
        if first_action:
            recommended_action = first_action.title
        elif first_rec and first_rec.suggested_actions:
            recommended_action = first_rec.suggested_actions[0]
        else:
            recommended_action = "Review material intelligence signal"

        return {
            "domain": package_id,
            "event_type": "material_intelligence_signal",
            "signal_type": signal_type,
            "entity_name": entity_name,
            "recommended_action": recommended_action,
        }
