import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AgentLogEntry } from '../types';

interface LogPanelViewProps {
    logs: AgentLogEntry[];
}

function getTypeIcon(type: string): string {
    switch (type) {
        case 'tool_call':
            return '🔧';
        case 'prompt_sent':
            return '📤';
        case 'response_received':
            return '📥';
        case 'error':
            return '❌';
        default:
            return '📝';
    }
}

function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

export function LogPanelView({ logs }: LogPanelViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelHeight, setPanelHeight] = useState(150);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [logs]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!panelRef.current) return;
            const viewportHeight = window.innerHeight;
            const newHeight = viewportHeight - e.clientY;
            const clampedHeight = Math.max(60, Math.min(newHeight, viewportHeight * 0.5));
            setPanelHeight(clampedHeight);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const handleResizeStart = (e: MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    return (
        <div class="log-panel" ref={panelRef} style={{ height: `${panelHeight}px` }}>
            <div
                class={`log-panel-resize-handle ${isDragging ? 'dragging' : ''}`}
                onMouseDown={handleResizeStart}
            />
            <div class="log-panel-header">
                <span class="log-panel-title">Agent Activity</span>
                <span class="log-panel-count">{logs.length} logs</span>
            </div>
            <div class="log-panel-content" ref={containerRef}>
                {logs.length === 0 ? (
                    <div class="log-empty">No agent activity yet</div>
                ) : (
                    logs.map((log, index) => (
                        <div class={`log-entry log-type-${log.type}`} key={index}>
                            <span class="log-timestamp">{formatTimestamp(log.timestamp)}</span>
                            <span class="log-icon">{getTypeIcon(log.type)}</span>
                            <span class="log-message">{log.message}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
