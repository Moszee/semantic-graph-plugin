# TASK

Refine the focal node based on user request. Create a graph delta that may include updates to the focal node, new supporting nodes, or removal of obsolete nodes.

You have access to tools to explore the graph. Use them to understand the context before making changes.

# AVAILABLE TOOLS

- `get_node(id)`: Get full details of a node by its ID
- `get_subgraph(entryPointId)`: Get all nodes reachable from an entry point (BFS traversal)
- `find_nodes(filters)`: Find nodes by entry point filters. Filters are OR'd groups of AND'd tags.

# INPUT

## Focal Node

{{FOCAL_NODE}}

## Connected Nodes

{{CONNECTED_NODES}}

## Graph Overview

{{GRAPH_SUMMARY}}

## GraphDelta Schema

```json
{
  "name": "string - descriptive name for this refinement",
  "description": "string - what changes are being made",
  "operations": [
    {
      "operation": "add | update | remove",
      "node": {
        "id": "string - unique identifier (snake_case)",
        "type": "behavior | decision | data | integration | view",
        "name": "string - human readable name",
        "description": "string - detailed description",
        "invariants": ["string - rules that must always hold"],
        "questions": ["string - uncertainties for user to clarify"],
        "entryPoints": [{"type": "REST | JOB | LISTENER | UI | OTHER", "name": "string"}],
        "inputs": ["string - IDs of nodes this depends on"],
        "outputs": ["string - IDs of nodes that depend on this"],
        "metadata": {"key": "value"}
      }
    }
  ]
}
```

# RULES

1. [MUST] Return valid JSON (JSON mode is enabled)
2. [MUST] Keep focal node ID unchanged if updating it
3. [MUST] Use unique, descriptive IDs for new nodes (snake_case)
4. [MUST] Ensure inputs/outputs references are consistent across all nodes
5. [MUST] Add `questions` for anything uncertain about the refinement
6. [SHOULD] Use tools to explore related nodes before making changes
7. [SHOULD] Think about supporting nodes needed to fulfill the request
8. [AVOID] Quotation marks (" or ') in descriptions and names
9. [AVOID] Colons (:) except in URLs or paths

# OUTPUT FORMAT

Return a valid JSON GraphDelta object with:
- `name`: Descriptive name for this refinement
- `description`: Summary of changes being made
- `operations`: Array of add/update/remove operations

