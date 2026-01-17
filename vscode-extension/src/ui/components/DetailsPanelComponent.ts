import { IHtmlComponent } from './HtmlComponent';

/**
 * Details panel structure component
 */
export class DetailsPanelComponent implements IHtmlComponent {
    render(): string {
        return `
            <div class="details-panel" id="detailsPanel">
                <div class="details-header">
                    <h3>Node Details</h3>
                    <button class="close-btn" onclick="closeDetails()">×</button>
                </div>
                <div class="details-content" id="detailsContent">
                </div>
            </div>
        `;
    }
}
