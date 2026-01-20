import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { IntentNode, AgentLogEntry } from './types';
import { NodeDetailsContainer } from './containers/NodeDetailsContainer';
import { IntentPromptView } from './components/IntentPromptView';
import { LogPanelView } from './components/LogPanelView';
import { postVSCodeMessage } from './hooks/useVSCodeMessage';

function App() {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [nodes, setNodes] = useState<IntentNode[]>([]);
    const [selectedIntent, setSelectedIntent] = useState<any>(null);
    const [deltaNodeIds, setDeltaNodeIds] = useState<Set<string>>(new Set());
    const [logs, setLogs] = useState<AgentLogEntry[]>([]);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    useEffect(() => {
        // Load initial data from window
        if (window.GRAPH_DATA) {
            setNodes(window.GRAPH_DATA.nodes);
            setSelectedIntent(window.GRAPH_DATA.selectedIntent);
            setDeltaNodeIds(window.GRAPH_DATA.deltaNodeIds);
            setLogs(window.GRAPH_DATA.logs || []);
        }

        // Listen for node selection events from the graph
        const handleNodeSelect = (e: CustomEvent) => {
            setSelectedNodeId(e.detail.nodeId);
        };

        // Listen for log updates from extension
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.command === 'updateLogs') {
                setLogs(message.logs);
            }
        };

        window.addEventListener('nodeSelected', handleNodeSelect as EventListener);
        window.addEventListener('message', handleMessage);

        // Signal that graph container is ready for legacy scripts
        setTimeout(() => {
            window.dispatchEvent(new Event('graph-container-ready'));
        }, 0);

        return () => {
            window.removeEventListener('nodeSelected', handleNodeSelect as EventListener);
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;
    const isEditable = selectedIntent !== null && selectedNodeId !== null && deltaNodeIds.has(selectedNodeId);

    return (
        <div class="container">
            {/* Toolbar - TODO: Create component */}
            <div class="toolbar">
                <button class="toolbar-btn" id="newIntentBtn">
                    New Intention
                </button>
            </div>

            {/* Intent Bar - shown in top bar area when intent is selected */}
            {selectedIntent && (
                <div class="intent-bar">
                    <div class="intent-info">
                        <span class="intent-label">Current Intent:</span>
                        <strong>{selectedIntent.name}</strong>
                        <span class="intent-desc">{selectedIntent.description}</span>
                    </div>
                    <div class="intent-actions">
                        <button class="intent-btn intent-btn-implement" onClick={() => (window as any).implement?.()}>Implement</button>
                        <button class="intent-btn intent-btn-discard" onClick={() => (window as any).discard?.()}>Discard</button>
                    </div>
                </div>
            )}

            <div class="main-content">
                {/* Canvas - TODO: Create component */}
                <div class="canvas-container" id="canvasContainer">
                    <div class="graph-wrapper" id="graphWrapper">
                        <svg id="edges-svg">
                            <defs>
                                <marker id="arrowhead-default" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#555555" />
                                </marker>
                                <marker id="arrowhead-uses" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#4fc3f7" />
                                </marker>
                                <marker id="arrowhead-triggers" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#ff8a65" />
                                </marker>
                                <marker id="arrowhead-filters" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#aed581" />
                                </marker>
                                <marker id="arrowhead-produces" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                    <polygon points="0 0, 10 3.5, 0 7" fill="#ba68c8" />
                                </marker>
                            </defs>
                        </svg>
                        <div id="graph">
                            {nodes.length === 0 && !selectedIntent && (
                                <div class="empty-state">
                                    <h2>No nodes yet</h2>
                                    <p>Create a .intent-graph/nodes directory with YAML files to get started.</p>
                                </div>
                            )}
                            {nodes.length === 0 && selectedIntent && (
                                <div class="empty-state">
                                    <h2>Intent: {selectedIntent.name}</h2>
                                    <p>{selectedIntent.description || 'No description'}</p>
                                    <p class="empty-state-hint">This intent has no nodes yet. Use the AI prompt to add nodes to this intent.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Details Panel - shows Node Details or Intent Prompt */}
                <div class="details-panel" id="detailsPanel" style={{ display: (selectedNode || selectedIntent) ? 'block' : 'none' }}>
                    {selectedNode ? (
                        <>
                            <div class="details-header">
                                <h3>Node Details</h3>
                                <button class="close-btn" onClick={() => setSelectedNodeId(null)}>
                                    ×
                                </button>
                            </div>
                            <NodeDetailsContainer
                                node={selectedNode}
                                isEditable={isEditable}
                                aiPrompt={aiPrompt}
                                isAiLoading={isAiLoading}
                                onAiPromptChange={setAiPrompt}
                                onAiLoadingChange={setIsAiLoading}
                            />
                        </>
                    ) : selectedIntent ? (
                        <IntentPromptView
                            intentName={selectedIntent.name}
                            value={aiPrompt}
                            isLoading={isAiLoading}
                            onChange={setAiPrompt}
                            onSubmit={() => {
                                if (!aiPrompt.trim()) return;
                                setIsAiLoading(true);
                                postVSCodeMessage({
                                    command: 'refineIntent',
                                    intentName: selectedIntent.name,
                                    prompt: aiPrompt,
                                });
                                setTimeout(() => {
                                    setIsAiLoading(false);
                                    setAiPrompt('');
                                }, 2000);
                            }}
                            onKeyDown={(e) => {
                                if (e.ctrlKey && e.key === 'Enter') {
                                    e.preventDefault();
                                    if (!aiPrompt.trim()) return;
                                    setIsAiLoading(true);
                                    postVSCodeMessage({
                                        command: 'refineIntent',
                                        intentName: selectedIntent.name,
                                        prompt: aiPrompt,
                                    });
                                    setTimeout(() => {
                                        setIsAiLoading(false);
                                        setAiPrompt('');
                                    }, 2000);
                                }
                            }}
                        />
                    ) : null}
                </div>
            </div>

            {/* Log Panel - below the graph */}
            <LogPanelView logs={logs} />
        </div>
    );
}

// Render the app
render(<App />, document.getElementById('root')!);

