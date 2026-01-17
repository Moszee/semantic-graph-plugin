import { h } from 'preact';
import { useState } from 'preact/hooks';
import { IntentNode } from '../types';
import { NodeDetailsView } from '../components/NodeDetailsView';
import { postVSCodeMessage } from '../hooks/useVSCodeMessage';

interface NodeDetailsContainerProps {
    node: IntentNode;
    isEditable: boolean;
}

export function NodeDetailsContainer({ node, isEditable }: NodeDetailsContainerProps) {
    const [aiPrompt, setAiPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleAIPromptChange = (value: string) => {
        setAiPrompt(value);
    };

    const handleAISubmit = () => {
        if (!aiPrompt.trim()) return;

        setIsLoading(true);
        postVSCodeMessage({
            command: 'tweakNode',
            nodeId: node.id,
            prompt: aiPrompt,
        });

        // Clear loading state after 2 seconds
        // TODO: Listen for response from extension to clear properly
        setTimeout(() => {
            setIsLoading(false);
            setAiPrompt('');
        }, 2000);
    };

    const handleAIKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            handleAISubmit();
        }
    };

    const handleFieldUpdate = (field: string, value: string) => {
        postVSCodeMessage({
            command: 'updateNode',
            nodeId: node.id,
            field,
            value,
        });
    };

    return (
        <NodeDetailsView
            node={node}
            isEditable={isEditable}
            aiPrompt={aiPrompt}
            isLoading={isLoading}
            onAIPromptChange={handleAIPromptChange}
            onAISubmit={handleAISubmit}
            onAIKeyDown={handleAIKeyDown}
            onFieldUpdate={handleFieldUpdate}
        />
    );
}
