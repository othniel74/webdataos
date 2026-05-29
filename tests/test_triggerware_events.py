import uuid

from apps.api.db.models import AutonomousAction
from apps.api.routes.triggerware import _event_from_action


def test_triggerware_events_feed_shapes_action_rows():
    action_id = f"act_{uuid.uuid4().hex[:8]}"
    action = AutonomousAction(
        id=action_id,
        workspace_id="workspace_test_triggerware",
        run_id=None,
        recommendation_id="rec_1",
        action_type="update_competitive_brief",
        status="pending_approval",
        title="Update competitive brief: Acme",
        description="Translate pricing signal into sales guidance.",
        payload={"entities": ["Acme"], "package_id": "gtm"},
    )

    row = _event_from_action(action, None)

    assert row["event_id"] == action_id
    assert row["domain"] == "gtm"
    assert row["entity_name"] == "Acme"
    assert row["workflow_action"] == "update_competitive_brief"
