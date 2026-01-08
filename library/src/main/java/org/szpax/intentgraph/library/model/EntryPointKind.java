package org.szpax.intentgraph.library.model;

/**
 * Represents the type of entry point that triggers a node.
 * - ENDPOINT: HTTP/REST/GraphQL endpoints
 * - JOB: Scheduled or background jobs
 * - QUEUE: Message queues or topics
 */
public enum EntryPointKind {
    ENDPOINT, JOB, QUEUE
}
