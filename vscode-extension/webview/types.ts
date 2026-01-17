/**
 * Represents the type of an intent node.
 */
export type NodeType = 'behavior' | 'decision' | 'data' | 'integration';

/**
 * Represents the type of entry point that triggers a node.
 */
export type EntryPointType = 'REST' | 'JOB' | 'LISTENER' | 'UI' | 'OTHER';

/**
 * Represents an entry point for a node.
 */
export interface EntryPoint {
    type: EntryPointType;
    name: string;
}

/**
 * Represents a single node in the Intent Graph.
 */
export interface IntentNode {
    id: string;
    type: NodeType;
    name: string;
    description: string;
    invariants?: string[];
    questions?: string[];
    entryPoints?: EntryPoint[];
    inputs?: string[];
    outputs?: string[];
    metadata?: Record<string, string>;
}

/**
 * Represents a delta operation type.
 */
export type DeltaOperationType = 'add' | 'update' | 'remove';

/**
 * Represents a single delta operation.
 */
export interface DeltaOperation {
    operation: DeltaOperationType;
    node: IntentNode;
}

/**
 * Represents a graph delta (intent).
 */
export interface GraphDelta {
    name: string;
    description: string;
    operations: DeltaOperation[];
}

/**
 * Type of agent log entry.
 */
export type AgentLogType = 'tool_call' | 'prompt_sent' | 'response_received' | 'error';

/**
 * Represents a single log entry from the agent.
 */
export interface AgentLogEntry {
    timestamp: number;
    type: AgentLogType;
    message: string;
}

export interface WindowGraphData {
    nodes: IntentNode[];
    selectedIntent: GraphDelta | null;
    deltaNodeIds: Set<string>;
    logs: AgentLogEntry[];
}

declare global {
    interface Window {
        GRAPH_DATA: WindowGraphData;
    }
}

