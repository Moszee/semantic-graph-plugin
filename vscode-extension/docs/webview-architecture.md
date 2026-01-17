# VS Code Extension Webview Architecture

This document describes the modular architecture for webview-based UI components in the VS Code extension.

## Overview

The Intent Graph visualization uses a clean separation of concerns:
- **TypeScript Components** - Server-side HTML generation (`src/ui/components/`)
- **External CSS** - Styles (`resources/intent-graph.css`)
- **External JavaScript** - Client-side logic (`resources/scripts/`)

## Architecture

```
vscode-extension/
├── src/ui/
│   ├── IntentGraphPanel.ts           # Main webview panel orchestrator
│   └── components/
│       ├── HtmlComponent.ts          # Base interface + utilities
│       ├── IntentGraphDocument.ts    # Top-level document composer
│       ├── ToolbarComponent.ts       # Toolbar UI
│       ├── GraphCanvasComponent.ts   # Canvas, SVG, zoom controls
│       ├── DetailsPanelComponent.ts  # Node details panel
│       ├── IntentBarComponent.ts     # Bottom intent action bar
│       └── EmptyStateComponent.ts    # Empty state message
└── resources/
    ├── intent-graph.css              # All styles
    └── scripts/
        ├── graph-state.js            # State management
        ├── graph-layout.js           # Node positioning
        ├── graph-renderer.js         # DOM rendering
        ├── graph-edges.js            # Edge drawing
        ├── graph-interaction.js      # Drag/pan/zoom
        ├── details-panel.js          # Details panel logic
        ├── vscode-api.js             # Extension communication
        └── main.js                   # Entry point
```

## HTML Components

All components implement `IHtmlComponent`:

```typescript
interface IHtmlComponent {
    render(): string;
}
```

### Creating a New Component

```typescript
import { IHtmlComponent } from './HtmlComponent';

export class MyComponent implements IHtmlComponent {
    constructor(private data: MyData) {}

    render(): string {
        return `<div class="my-component">${this.data.content}</div>`;
    }
}
```

### Utility: HtmlBuilder

Use `HtmlBuilder.escapeHtml()` to escape user content:

```typescript
import { HtmlBuilder } from './HtmlComponent';

const safe = HtmlBuilder.escapeHtml(userInput);
```

## JavaScript Modules

Scripts are loaded in order by `IntentGraphDocument`. Data is injected via:

```javascript
window.GRAPH_DATA = {
    nodes: [...],
    selectedIntent: {...},
    deltaNodeIds: new Set([...])
};
```

### Module Responsibilities

| Module | Purpose |
|--------|---------|
| `graph-state.js` | State variables and getters/setters |
| `graph-layout.js` | Grid layout positioning |
| `graph-renderer.js` | Node DOM creation |
| `graph-edges.js` | SVG edge paths |
| `graph-interaction.js` | User interaction handlers |
| `details-panel.js` | Details panel rendering |
| `vscode-api.js` | `vscode.postMessage()` wrapper |
| `main.js` | Initialization and event binding |

## Adding New Features

1. **New UI Section**: Create a component in `src/ui/components/`, use in `IntentGraphDocument`
2. **New Styles**: Add to `resources/intent-graph.css`
3. **New Client Logic**: Add to appropriate module in `resources/scripts/`
4. **New State**: Add to `graph-state.js` with getter/setter

## Testing

1. Launch Extension Host (F5)
2. Open Intent Graph panel
3. Verify nodes render
4. Test drag/pan/zoom
5. Check browser console for errors
