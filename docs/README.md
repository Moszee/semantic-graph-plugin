# Intent Graph – Schema, Agent Interaction, and Usage Guide

This document describes the **Intent Graph** concept: its schema, how AI agents interact with it, and how developers use it through IDE plugins.

---

## 1. Core Concept

The Intent Graph is a **declarative model of application behavior** that serves as the single source of truth for what the system should do.

**Key principles:**

*   **Intent is authoritative** – defines system behavior independent of implementation
*   **Code follows intent** – implementation conforms to the intent graph
*   **AI assists, doesn't dictate** – agents propose changes; developers approve
*   **Version-controlled** – stored as YAML/JSON files in your repository

---

## 2. Intent Graph Schema

### Node Structure

Each node in the intent graph represents a behavioral unit with the following properties:

```yaml
id: unique_node_identifier
name: Human-readable node name
description: What this behavior does
type: behavior | event | transition | invariant
inputs:
  - name: input_parameter_name
    type: string | number | boolean | object
    source: node_id  # References another node's output
outputs:
  - name: output_parameter_name
    type: string | number | boolean | object
metadata:
  tags: [tag1, tag2]
  owner: team_name
```

### Entry Points

Entry points define how external systems interact with your intent graph:

```yaml
entry_points:
  - id: user_login_endpoint
    kind: endpoint  # endpoint | job | queue/topic
    method: POST
    path: /api/auth/login
    target_node: authenticate_user
  - id: daily_cleanup_job
    kind: job
    schedule: "0 2 * * *"
    target_node: cleanup_expired_sessions
  - id: order_created_event
    kind: queue/topic
    source: order_service
    target_node: process_order
```

### Edge Types and Relations

Edges connect nodes through their inputs/outputs and represent different types of relationships:

*   **Data flow** – output of one node feeds into input of another
*   **Sequence** – nodes execute in order
*   **Branching** – conditional paths based on outputs
*   **Aggregation** – multiple inputs converge into one node

### Invariants

Invariants are constraints that must always hold true:

```yaml
invariants:
  - id: user_must_be_authenticated
    description: All user actions require valid authentication
    applies_to: [profile_update, password_change, logout]
    condition: authenticated == true
```

---

## 3. AI Agent Interaction

### How AI Proposes Changes

The workflow for AI-assisted modifications:

1.  **Developer expresses intent** – "Add email verification to user registration"
2.  **Plugin prepares context** – extracts relevant subgraph and node definitions
3.  **AI proposes graph delta** – suggests new nodes, edges, or modifications
4.  **Developer reviews in IDE** – visualizes the proposed changes
5.  **Approval and implementation** – developer accepts delta, then requests code generation

### Graph Delta Format

AI agents propose changes as structured deltas:

```yaml
delta:
  add_nodes:
    - id: send_verification_email
      name: Send Verification Email
      type: behavior
      inputs:
        - name: user_email
          type: string
          source: register_user
      outputs:
        - name: email_sent
          type: boolean
  
  update_nodes:
    - id: register_user
      outputs:
        - name: user_email  # New output
          type: string
  
  remove_nodes:
    - id: old_registration_flow
  
  add_edges:
    - from: register_user
      to: send_verification_email
      via: user_email
```

### Context Preparation

The IDE plugin provides AI agents with focused context:

*   **Subgraph extraction** – only relevant nodes and their dependencies
*   **Schema definitions** – type information and constraints
*   **Existing invariants** – rules that must be preserved
*   **Entry point mapping** – how external systems interact with affected nodes

**Key principle:** AI receives structured, schema-compliant context and returns structured, schema-compliant deltas.

---

## 4. How to Use the Intent Graph

### Via IDE Plugins (Primary Method)

The VSCode and IntelliJ IDEA plugins provide the main interface for working with intent graphs:

#### Viewing the Graph

1.  Open the **Intent Graph** panel in your IDE
2.  Navigate the visual representation of nodes and edges
3.  Click nodes to see details, inputs, outputs, and metadata
4.  Filter by tags, types, or entry points

#### Requesting AI Assistance

1.  Select a node or region of the graph
2.  Describe your desired change in natural language
3.  Review the proposed delta visualization
4.  Refine or approve the delta
5.  Press **"Implement"** to generate code changes

#### Manual Editing

You can also edit the YAML/JSON files directly:

```yaml
# .intent-graph/user_flows.yaml
nodes:
  - id: authenticate_user
    name: Authenticate User
    type: behavior
    inputs:
      - name: username
        type: string
      - name: password
        type: string
    outputs:
      - name: auth_token
        type: string
      - name: user_id
        type: string
```

**Plugin features:**
*   Syntax validation as you type
*   Auto-completion for node references
*   Visual diff for deltas
*   One-click navigation between nodes
*   Integrated AI assistance

#### Workflow Example

**Scenario:** Add password reset functionality

1.  **Express intent:** "Add password reset flow triggered by email link"
2.  **AI proposes delta:**
    *   New nodes: `request_reset`, `validate_reset_token`, `update_password`
    *   New entry point: `POST /api/auth/reset-password`
    *   New edges connecting the flow
3.  **Review in IDE:** Visualize how new nodes integrate with existing authentication
4.  **Approve delta:** Graph files updated in `.intent-graph/`
5.  **Implement:** AI generates code conforming to the new intent
6.  **Commit:** Graph files and code committed together to Git

---

## 5. Storage and Versioning

### File Structure

```
.intent-graph/
  ├── authentication.yaml
  ├── user_management.yaml
  ├── order_processing.yaml
  └── schema_version.yaml
```

### Git Integration

*   **Intent graphs are version-controlled** – track changes over time
*   **Deltas are auditable** – see what changed and why
*   **Team synchronization** – pull/merge like any other code
*   **Branch flows** – experiment with intent changes in feature branches

### Merge Conflicts

When two developers modify the same intent graph:

1.  Git detects conflicts in YAML files
2.  IDE plugin provides visual merge tool
3.  Resolve at the node/edge level, not raw text
4.  Plugin validates merged result against schema

---

## 6. Design Principles

*   **Schema-first** – well-defined structure enables tooling and AI assistance
*   **Human-in-the-loop** – developers always review and approve AI proposals
*   **Declarative** – describe *what*, not *how*
*   **Composable** – nodes and edges form reusable patterns
*   **Observable** – visualization makes intent transparent
*   **Verifiable** – schema validation ensures correctness

---

## 7. Nice-to-Have: Standalone Library and Backend

> [!NOTE]
> The following components are **optional** and only needed if you want to build custom tooling beyond the VSCode/IntelliJ plugins.

### Standalone Library (Optional)

If the IDE plugins don't meet your needs, you can use the standalone library:

**Responsibilities:**
*   Load and persist intent graphs from YAML/JSON
*   Validate schema compliance and invariants
*   Query nodes, subgraphs, and dependencies
*   Apply deltas programmatically
*   Generate AI context

**When you might need it:**
*   Building CI/CD validation tools
*   Creating custom visualizations
*   Integrating with other development tools
*   Automating graph transformations

### Backend Service (Optional)

For teams wanting centralized graph management:

**Responsibilities:**
*   Centralized graph storage (beyond Git)
*   Multi-user collaboration features
*   Advanced querying and analytics
*   Integration with external systems

**When you might need it:**
*   Large teams with complex coordination needs
*   Centralized governance and compliance
*   Real-time collaboration on graph changes
*   Cross-repository intent sharing

**For most use cases, the IDE plugins with Git-based storage are sufficient.**
