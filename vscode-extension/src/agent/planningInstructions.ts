import { GraphDelta, IntentNode } from '../lib/types';
import { loadImplementationInstructionsTemplate, fillTemplate } from '../lib/prompts';

/**
 * Generate instructions for Antigravity Agent to implement an intent.
 */
export function generatePlanningInstructions(intent: GraphDelta, nodes: IntentNode[]): string {
    // Build operations description
    const operationsLines: string[] = [];
    const allQuestions: string[] = [];

    for (const op of intent.operations || []) {
        // Collect questions from each operation's node
        if (op.node.questions?.length) {
            allQuestions.push(...op.node.questions.map(q => `- ${op.node.name}: ${q}`));
        }

        switch (op.operation) {
            case 'add':
                operationsLines.push(`### ADD: ${op.node.name} (${op.node.type})`);
                operationsLines.push(`- **ID**: ${op.node.id}`);
                operationsLines.push(`- **Description**: ${op.node.description}`);
                if (op.node.inputs?.length) {
                    operationsLines.push(`- **Depends on**: ${op.node.inputs.join(', ')}`);
                }
                if (op.node.outputs?.length) {
                    operationsLines.push(`- **Produces for**: ${op.node.outputs.join(', ')}`);
                }
                if (op.node.invariants?.length) {
                    operationsLines.push(`- **Invariants (MUST hold)**: ${op.node.invariants.join('; ')}`);
                }
                operationsLines.push('');
                break;
            case 'update':
                operationsLines.push(`### UPDATE: ${op.node.name} (${op.node.id})`);
                operationsLines.push(`- **New Description**: ${op.node.description}`);
                operationsLines.push('');
                break;
            case 'remove':
                operationsLines.push(`### REMOVE: ${op.node.name} (${op.node.id})`);
                operationsLines.push('');
                break;
        }
    }

    // Build node IDs list
    const nodeIds = nodes.slice(0, 20).map(n => n.id).join(', ');

    // Format questions
    const questionsText = allQuestions.length > 0
        ? allQuestions.join('\n')
        : '(No questions - proceed with implementation)';

    // Try to load template from file
    try {
        const template = loadImplementationInstructionsTemplate();
        return fillTemplate(template, {
            'INTENT_NAME': intent.name,
            'INTENT_DESCRIPTION': intent.description || 'No description provided.',
            'OPERATIONS': operationsLines.join('\n'),
            'NODE_IDS': nodeIds || '(none)',
            'QUESTIONS': questionsText
        });
    } catch {
        // Fallback to inline format if template not found
        return [
            `# Implementation Instructions for Intent: ${intent.name}`,
            '',
            `## Description`,
            intent.description || 'No description provided.',
            '',
            `## Changes to Implement`,
            '',
            ...operationsLines,
            '',
            `## Questions to Address`,
            questionsText,
            '',
            `## Context`,
            `Related nodes: ${nodeIds}`
        ].join('\n');
    }
}
