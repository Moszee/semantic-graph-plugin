package org.szpax.intentgraph.library.model;

/**
 * Represents an entry point that triggers a node.
 * 
 * @param kind The type of entry point (ENDPOINT, JOB, QUEUE)
 * @param name Identifier for this entry point (e.g., "POST /api/users",
 *             "daily-sync")
 */
public record EntryPoint(EntryPointKind kind, String name) {
}
