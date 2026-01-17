import { IHtmlComponent } from './HtmlComponent';

/**
 * Graph canvas component with SVG layer and controls
 */
export class GraphCanvasComponent implements IHtmlComponent {
    constructor(private showEmptyState: boolean) { }

    render(): string {
        return `
            <div class="canvas-container" id="canvasContainer">
                <div class="graph-wrapper" id="graphWrapper">
                    <svg id="edges-svg">
                        <defs>
                            <marker id="arrowhead-default" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-color)"/>
                            </marker>
                            <marker id="arrowhead-uses" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-uses)"/>
                            </marker>
                            <marker id="arrowhead-triggers" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-triggers)"/>
                            </marker>
                            <marker id="arrowhead-filters" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-filters)"/>
                            </marker>
                            <marker id="arrowhead-produces" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="var(--edge-produces)"/>
                            </marker>
                        </defs>
                    </svg>
                    <div id="graph">
                        ${this.showEmptyState ? `
                            <div class="empty-state">
                                <h2>No nodes yet</h2>
                                <p>Create a .intent-graph/nodes directory with YAML files to get started.</p>
                            </div>
                        ` : ''}
                    </div>
                </div>
                <div class="zoom-controls">
                    <button class="zoom-btn" onclick="zoomOut()">−</button>
                    <span class="zoom-level" id="zoomLevel">100%</span>
                    <button class="zoom-btn" onclick="zoomIn()">+</button>
                </div>
                <div class="edge-legend">
                    <div class="edge-legend-title">Relations</div>
                    <div class="edge-legend-item">
                        <span class="edge-legend-color" style="background: var(--edge-uses)"></span>
                        <span>uses</span>
                    </div>
                    <div class="edge-legend-item">
                        <span class="edge-legend-color" style="background: var(--edge-triggers)"></span>
                        <span>triggers</span>
                    </div>
                    <div class="edge-legend-item">
                        <span class="edge-legend-color" style="background: var(--edge-filters)"></span>
                        <span>filters</span>
                    </div>
                    <div class="edge-legend-item">
                        <span class="edge-legend-color" style="background: var(--edge-produces)"></span>
                        <span>produces</span>
                    </div>
                </div>
            </div>
        `;
    }
}
