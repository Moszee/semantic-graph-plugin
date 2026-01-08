/**
 * Represents the type of an intent node.
 */
export type NodeType = 'behavior' | 'event' | 'transition' | 'invariant' | 'entrypoint';

/**
 * Represents a reference to another node.
 */
export interface NodeReference {
    nodeId: string;
    relation?: string;
}

/**
 * Represents the type of entry point that triggers a node.
 */
export type EntryPointType = 'endpoint' | 'job' | 'queue';

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
    entryPoints?: EntryPoint[];
    inputs?: NodeReference[];
    outputs?: NodeReference[];
    metadata?: Record<string, string>;
}

/**
 * Represents the entire Intent Graph (current state).
 */
export interface IntentGraph {
    nodes: Map<string, IntentNode>;
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
