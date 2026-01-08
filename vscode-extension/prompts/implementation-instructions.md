# Implementation Instructions for Intent: {{INTENT_NAME}}

## Description

{{INTENT_DESCRIPTION}}

## ⚠️ Implementation Rules (MUST FOLLOW)

1. **Base logic on node descriptions**: The node descriptions define the expected behavior. Implement code that fulfills these descriptions exactly.

2. **Graph is the source of truth**: The Intent Graph defines the system architecture. All code must align with the graph structure and relationships.

3. **No mocking or TODOs**: Do NOT use mocks, stubs, or TODO comments. Implement real, working functionality.

4. **Implement at least the happy path**: Every feature must have a complete, working happy path. Handle the primary use case fully before considering edge cases.

5. **Follow node dependencies**: Respect the inputs/outputs relationships between nodes. If Node A depends on Node B, ensure B is implemented or available before A.

## Changes to Implement

{{OPERATIONS}}

## Context

Current related nodes in the graph:

{{CONTEXT_NODES}}
