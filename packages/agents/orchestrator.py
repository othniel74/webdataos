import asyncio
import time
import uuid
from packages.common.time import utc_now as import_utc_now
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update as sa_update
from apps.api.db.models import AgentRun, AutonomousAction, ChangeEvent, IntelligenceRecord, OrganizationalContext, Outcome, Topic
from packages.common.config import get_settings
from packages.common.logging import get_logger
from packages.agents.entity_extractor import EntityExtractor
from packages.agents.planner import ResearchPlanner
from packages.agents.synthesizer import ReportSynthesizer
from packages.intelligence.change_detection import ChangeDetectionService
from packages.intelligence.service import IntelligenceService
from packages.llm.client import LLMClient
from packages.memory.provider import MemoryProvider
from packages.observability.metrics import AGENT_RUN_DURATION, AGENT_RUNS
from packages.partners.speechmatics import SpeechmaticsService
from packages.partners.triggerware import TriggerWareService
from packages.reasoning.engine import ReasoningEngine
from packages.graph.neo4j_client import Neo4jGraphClient
from packages.schemas.agent import (
    DecisionBrief,
    DecisionEvidence,
    ResearchReport,
    ResearchRequest,
    ResearchRunReceipt,
    ResearchRunStage,
)
from packages.schemas.intelligence import RetrievalRequest
from packages.schemas.partners import MemorySearchRequest, MemoryUpsertRequest, TranscriptionRequest, WorkflowTriggerRequest
from packages.schemas.reasoning import ActionProposal, OrgContextRead

logger = get_logger(__name__)


class ResearchAgentOrchestrator:
    def __init__(
        self,
        intelligence: IntelligenceService | None = None,
        speechmatics: SpeechmaticsService | None = None,
        memory: MemoryProvider | None = None,
        triggerware: TriggerWareService | None = None,
        reasoning: ReasoningEngine | None = None,
        llm: LLMClient | None = None,
        graph: Neo4jGraphClient | None = None,
    ) -> None:
        self.intelligence = intelligence or IntelligenceService()
        self.speechmatics = speechmatics or SpeechmaticsService()
        self.memory = memory or MemoryProvider()
        self.triggerware = triggerware or TriggerWareService()
        self.reasoning = reasoning or ReasoningEngine()
        self.llm = llm or LLMClient()
        self.graph = graph or Neo4jGraphClient()
        self.planner = ResearchPlanner()
        self.synthesizer = ReportSynthesizer(llm=self.llm)
        self.entity_extractor = EntityExtractor(llm=self.llm)
        self.change_detector = ChangeDetectionService()
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
        previous_run_id, previous_report_json = await self._previous_run_report(db, topic_id)
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
                if request.allow_live_refresh:
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
                else:
                    stages.append(
                        ResearchRunStage(
                            name="brightdata_refresh",
                            status="skipped",
                            provider="bright_data_gateway",
                            detail="live refresh disabled for this turn",
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

            synthesizer = self.synthesizer if request.enable_llm else ReportSynthesizer()
            summary, findings, companies, changes, confidence = await synthesizer.synthesize_async(
                task_text, records, memories
            )

            # Gap 1: Named entity extraction — run concurrently with db_changes query
            extracted_entities, db_changes = await asyncio.gather(
                self.entity_extractor.extract(summary),
                self._recent_changes(db, topic_id, since=previous_run_at),
            )
            llm_used = request.enable_llm and self.llm.available and synthesizer is self.synthesizer
            if llm_used:
                provider = self.llm.last_provider or self.llm.provider or "llm"
                partner_trace.append(f"{provider}.chat.synthesis")
                stages.append(
                    ResearchRunStage(name="synthesize", status="success", provider=provider, detail=f"confidence={confidence:.2f}")
                )
            else:
                stages.append(
                    ResearchRunStage(
                        name="synthesize",
                        status="fallback",
                        provider="local_synthesizer",
                        detail="llm disabled for this run" if not request.enable_llm else f"confidence={confidence:.2f}",
                    )
                )

            # ── Phase 1+2: Load org context and run reasoning engine ──
            org_context = await self._load_org_context(db, topic_id)
            reasoning_output = None
            action_proposals = []
            change_report = None
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

                # Gap 2: Change detection — compare against previous run
                days_since = None
                if previous_run_at:
                    from datetime import timezone
                    prev_dt = previous_run_at if previous_run_at.tzinfo else previous_run_at.replace(tzinfo=timezone.utc)
                    days_since = round((import_utc_now() - prev_dt).total_seconds() / 86400, 1)
                change_report = self.change_detector.compare(
                    current_run_id=run_id,
                    previous_report=previous_report_json or {},
                    current_reasoning=reasoning_output,
                    current_records=records,
                    previous_run_id=previous_run_id or "",
                    days_since=days_since,
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
            if not request.enable_llm:
                fallbacks_used.append("llm_disabled")
            elif not self.llm.available:
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
            # Fix entity_name on records that carry generic workspace category names
            if extracted_entities and records:
                watch_types_lower = {wt.lower() for wt in (topic.watch_types if topic else [])}
                company_entities = [e for e in extracted_entities if e.get("type") in {"company", "organization"}]
                if not company_entities:
                    company_entities = extracted_entities
                generic_ids = [r.id for r in records if (r.entity_name or "").lower() in watch_types_lower]
                if generic_ids and company_entities:
                    await db.execute(
                        sa_update(IntelligenceRecord)
                        .where(IntelligenceRecord.id.in_(generic_ids))
                        .values(entity_name=company_entities[0]["name"])
                    )
                    await db.commit()
                    best_name = company_entities[0]["name"]
                    generic_id_set = set(generic_ids)
                    records = [
                        r.model_copy(update={"entity_name": best_name}) if r.id in generic_id_set else r
                        for r in records
                    ]

            if records and not previous_run_exists:
                summary = f"Baseline established for {topic.name if topic else topic_id}. {summary}"
            elif change_report and change_report.has_changes():
                summary = f"{change_report.delta_headline()}. {summary}"
            elif records and previous_run_exists:
                summary = f"Signals stable since last run. {summary}"
            run_receipt = ResearchRunReceipt(
                run_id=run_id,
                topic_id=topic_id,
                tenant_id=tenant_id,
                package_id=request.package_id,
                task=request.task,
                status="success",
                input_mode=request.input_mode,
                stages=stages,
                value_loop=value_loop,
                providers={
                    "speechmatics": "speechmatics" if transcript else None,
                    "memory": self.memory.provider_name if request.enable_memory else None,
                    "retrieval": "bright_data_gateway",
                    "llm": (self.llm.last_provider or self.llm.provider) if llm_used else "local_synthesizer",
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
            decision_brief = self._decision_brief(
                topic=topic,
                package_id=request.package_id,
                summary=summary,
                records=records,
                db_changes=db_changes,
                reasoning_output=reasoning_output,
                action_proposals=action_proposals,
                confidence=confidence,
                receipt=run_receipt,
                previous_run_exists=previous_run_exists,
                change_report=change_report,
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
                decision_brief=decision_brief,
                change_report=change_report.to_dict() if change_report else None,
            )
            db.add(AgentRun(id=run_id, tenant_id=tenant_id, topic_id=topic_id, task=request.task, status="success", report_json=report.model_dump()))
            await db.commit()

            # Write full run into Neo4j relationship graph (non-blocking — graph failure never fails the run)
            try:
                assessments = reasoning_output.materiality_assessments if reasoning_output else []
                recommendations = reasoning_output.recommendations if reasoning_output else []
                total_impact = sum(
                    (a.financial_impact or 0.0) for a in assessments if a.financial_impact
                )
                self.graph.write_run({
                    "run_id": run_id,
                    "tenant_id": tenant_id,
                    "topic_id": topic_id,
                    "package_id": request.package_id,
                    "task": request.task,
                    "risk_posture": reasoning_output.risk_posture if reasoning_output else "stable",
                    "confidence": confidence,
                    "created_at": import_utc_now(),
                    "records": [r.model_dump() for r in records],
                    "extracted_entities": extracted_entities,
                    "materiality_assessments": [
                        {
                            "signal_id": f"sig:{run_id}:{a.finding[:40]}",
                            "signal_type": self.reasoning._classify_signal(a.finding.lower()),
                            "materiality": a.materiality,
                            "finding": a.finding,
                            "affected_entities": a.affected_contracts or [],
                            "urgency": a.urgency,
                        }
                        for a in assessments
                    ],
                    "recommendations": [r.model_dump() for r in recommendations],
                    "autonomous_actions": [p.model_dump() for p in action_proposals],
                    "total_financial_impact": total_impact,
                })
            except Exception as graph_exc:
                logger.warning("graph_write_run_skipped", error=str(graph_exc)[:200], run_id=run_id)

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

    async def _previous_run_report(self, db: AsyncSession, topic_id: str | None) -> tuple[str, dict] | tuple[None, None]:
        """Fetch the most recent successful agent run's full report JSON and run_id for the topic."""
        if not topic_id:
            return None, None
        result = await db.execute(
            select(AgentRun.id, AgentRun.report_json, AgentRun.created_at)
            .where(AgentRun.topic_id == topic_id, AgentRun.status == "success")
            .order_by(desc(AgentRun.created_at))
            .limit(1)
        )
        row = result.one_or_none()
        if not row:
            return None, None
        return row[0], row[1]  # (run_id, report_json)

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

    def _decision_brief(
        self,
        topic: Topic | None,
        package_id: str,
        summary: str,
        records: list,
        db_changes: list[dict],
        reasoning_output,
        action_proposals: list,
        confidence: float,
        receipt: ResearchRunReceipt,
        previous_run_exists: bool,
        change_report=None,
    ) -> DecisionBrief:
        entities = [entity for entity in (topic.entities if topic else []) if entity]
        signals = [signal for signal in (topic.watch_types if topic else []) if signal]
        entity_label = ", ".join(entities[:3]) or (topic.name if topic else "this workspace")
        signal_label = ", ".join(signals[:3]) or "external signals"
        recommendations = reasoning_output.recommendations if reasoning_output else []
        first_recommendation = recommendations[0] if recommendations else None
        first_action = action_proposals[0] if action_proposals else None
        if change_report and change_report.has_changes():
            headline = change_report.delta_headline()
            parts = []
            if change_report.new_signals:
                parts.append(f"{len(change_report.new_signals)} new signal{'s' if len(change_report.new_signals) != 1 else ''} detected")
            if change_report.resolved_signals:
                parts.append(f"{len(change_report.resolved_signals)} signal{'s' if len(change_report.resolved_signals) != 1 else ''} resolved")
            if change_report.risk_posture_change:
                parts.append(f"risk posture changed: {change_report.risk_posture_change}")
            if change_report.new_entities:
                parts.append(f"new entities: {', '.join(change_report.new_entities[:3])}")
            what_changed = ". ".join(parts) + "." if parts else "Signals changed since last run."
        elif db_changes:
            headline = f"{len(db_changes)} monitored change{'s' if len(db_changes) != 1 else ''} need review"
            what_changed = f"{len(db_changes)} saved evidence fields changed since the previous run."
        elif previous_run_exists and records:
            headline = f"Signals stable for {entity_label}"
            what_changed = "No new signals detected. Evidence baseline is current."
        elif records:
            headline = f"Baseline created for {entity_label}"
            what_changed = f"{len(records)} evidence records saved as baseline for future comparison."
        else:
            headline = f"No evidence found yet for {entity_label}"
            what_changed = "No usable evidence was retrieved for this run."

        if first_recommendation:
            business_impact = first_recommendation.description or first_recommendation.reasoning
            recommended_action = (first_recommendation.suggested_actions or [first_recommendation.title])[0]
            severity = first_recommendation.materiality
        elif first_action:
            business_impact = first_action.description
            recommended_action = first_action.title
            severity = first_action.urgency or "monitoring"
        elif records:
            business_impact = f"{entity_label} is now backed by saved evidence for {signal_label}; review whether it affects the current decision cycle."
            recommended_action = "Review the evidence baseline and decide whether to adjust monitoring scope or ownership."
            severity = "monitoring"
        else:
            business_impact = "There is not enough evidence yet to assess business impact."
            recommended_action = "Add or refresh sources, then run monitoring again."
            severity = "unknown"

        evidence = []
        for record in records[:5]:
            source_url = getattr(record, "source_url", None)
            if not source_url:
                continue
            facts = getattr(record, "facts", None) or {}
            evidence.append(
                DecisionEvidence(
                    id=getattr(record, "id", source_url),
                    entity_name=getattr(record, "entity_name", None),
                    source_url=source_url,
                    source_title=facts.get("evidence_title"),
                    summary=getattr(record, "summary", None),
                    confidence=getattr(record, "confidence", None) or 0.0,
                    freshness_status=getattr(record, "freshness_status", None),
                    why_it_matters=(
                        f"Supports {getattr(record, 'entity_name', None) or 'the monitored entity'} for {signal_label}."
                    ),
                )
            )
        unknowns = []
        if not records:
            unknowns.append("No fresh evidence is available yet.")
        if not reasoning_output:
            unknowns.append("Reasoning could not run because evidence was missing or insufficient.")
        if not topic:
            unknowns.append("Workspace configuration was not found for this run.")
        if not previous_run_exists:
            unknowns.append("This is the first baseline; change detection becomes stronger after the next run.")
        graph_explanation = (
            f"{topic.name if topic else 'The workspace'} connects {len(records)} evidence record"
            f"{'s' if len(records) != 1 else ''} to {len({r.entity_name for r in records if r.entity_name})} monitored entit"
            f"{'ies' if len({r.entity_name for r in records if r.entity_name}) != 1 else 'y'} and {len(action_proposals)} proposed action"
            f"{'s' if len(action_proposals) != 1 else ''}."
        )
        receipt_summary = (
            f"{receipt.counts.get('records_used', 0)} records, "
            f"{receipt.counts.get('recommendations', 0)} recommendations, "
            f"{receipt.counts.get('autonomous_actions', 0)} actions, "
            f"{receipt.counts.get('workflow_events', 0)} workflow events."
        )
        delta_headline = change_report.delta_headline() if change_report else None
        return DecisionBrief(
            headline=headline,
            delta_headline=delta_headline,
            answer=summary,
            what_changed=what_changed,
            business_impact=business_impact,
            severity=severity,
            confidence=confidence,
            recommended_action=recommended_action,
            evidence=evidence,
            unknowns=unknowns,
            graph_explanation=graph_explanation,
            receipt_summary=receipt_summary,
        )

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
