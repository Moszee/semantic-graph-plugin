import { IHtmlComponent } from './HtmlComponent';
import { ToolbarComponent } from './ToolbarComponent';
import { GraphCanvasComponent } from './GraphCanvasComponent';
import { DetailsPanelComponent } from './DetailsPanelComponent';
import { IntentBarComponent, GraphDelta } from './IntentBarComponent';

export interface IntentGraphDocumentConfig {
    nodes: any[];
    selectedIntent: GraphDelta | null;
    deltaNodeIds: string[];
    styleUri: string;
    scriptUriBase: string;
    nodesJson: string;
    intentJson: string;
    deltaNodeIdsJson: string;
    scriptNonce?: string;
}

/**
 * Top-level document builder for Intent Graph visualization
 */
export class IntentGraphDocument implements IHtmlComponent {
    constructor(private config: IntentGraphDocumentConfig) { }

    render(): string {
        const toolbar = new ToolbarComponent();
        const canvas = new GraphCanvasComponent(this.config.nodes.length === 0);
        const detailsPanel = new DetailsPanelComponent();
        const intentBar = new IntentBarComponent(this.config.selectedIntent);

        const nonce = this.config.scriptNonce ? ` nonce="${this.config.scriptNonce}"` : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Intent Graph</title>
    <link rel="stylesheet" href="${this.config.styleUri}"${nonce}>
</head>
<body>
    <div class="container">
        ${toolbar.render()}
        
        <div class="main-content">
            ${canvas.render()}
            
            ${detailsPanel.render()}
        </div>
        
        ${intentBar.render()}
    </div>
    
    <script${nonce}>
        // Inject data as global variables for scripts to access
        window.GRAPH_DATA = {
            nodes: ${this.config.nodesJson},
            selectedIntent: ${this.config.intentJson},
            deltaNodeIds: new Set(${this.config.deltaNodeIdsJson})
        };
    </script>
    ${this.getScriptTags(nonce)}
</body>
</html>`;
    }

    /**
     * Generate script tags for all JavaScript modules
     * @param nonce - CSP nonce attribute
     * @returns HTML string with script tags
     */
    private getScriptTags(nonce: string): string {
        const scripts = [
            'graph-state.js',
            'graph-layout.js',
            'graph-renderer.js',
            'graph-edges.js',
            'graph-interaction.js',
            'details-panel-events.js',
            'vscode-api.js',
            'main.js'
        ];

        return scripts.map(scriptName => {
            const scriptUri = `${this.config.scriptUriBase}/${scriptName}`;
            return `    <script${nonce} src="${scriptUri}"></script>`;
        }).join('\n');
    }
}
