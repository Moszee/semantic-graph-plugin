# TASK

Analyze user requests and create graph deltas (intents) that describe new nodes or changes to the intent graph.

# INPUT

## Intent Graph Schema

Nodes have the following properties:
- **id**: Unique identifier (snake_case)
- **type**: One of: `behavior` | `decision` | `data` | `integration` | `view`
- **name**: Human-readable name
- **description**: What this node does/represents
- **inputs**: References to nodes this depends on (list of nodeId)
- **outputs**: References to nodes that depend on this (list of nodeId)
- **entryPoints**: List of entry points that trigger this node
  - **type**: One of: `REST` | `JOB` | `LISTENER` | `UI` | `OTHER`
  - **name**: Identifier (e.g., "POST /api/users", "daily-sync")
- **invariants**: Conditions that must always hold
- **questions**: Uncertainties for user to clarify before implementation
- **metadata**: Additional key-value pairs (implementation details go here)

### Entry Point Types
- **REST**: HTTP/REST/GraphQL endpoints
- **JOB**: Scheduled or background jobs
- **LISTENER**: Message queues or topics
- **UI**: User interface actions
- **OTHER**: Other trigger types

## Graph Context Summary

{{GRAPH_SUMMARY}}

Use tools (`get_node`, `get_subgraph`, `find_nodes`) to query detailed node information as needed.

## Delta Format

```json
{
  "name": "intent_name",
  "description": "What this change does",
  "operations": [
    {
      "operation": "add",
      "node": {
        "id": "unique_id",
        "type": "behavior",
        "name": "Node Name",
        "description": "Node description",
        "invariants": ["Condition that must hold"],
        "questions": ["What happens on failure?", "What is the timeout?"],
        "entryPoints": [{"type": "REST", "name": "POST /api/users"}],
        "inputs": ["dependency_node_id"],
        "outputs": ["dependent_node_id"],
        "metadata": {"implementation_detail": "value"}
      }
    }
  ]
}
```

# RULES

1. [MUST] Use tools to explore the graph before proposing changes
2. [MUST] Return valid JSON inside a ```json code block
3. [MUST] Keep implementation details in `metadata` only
4. [MUST] Add `questions` for anything uncertain (decision logic, validation rules, error handling)
5. [SHOULD] Propose minimal, focused changes
6. [SHOULD] Use meaningful IDs (snake_case)
7. [AVOID] Quotation marks (" or ') in descriptions and names
8. [AVOID] Colons (:) except in URLs or paths

# OUTPUT FORMAT

Return a GraphDelta as valid JSON in a ```json code block. The delta must include:
- `name`: Descriptive name for this intent
- `description`: Summary of what this change accomplishes
- `operations`: Array of add/update/remove operations
