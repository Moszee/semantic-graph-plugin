/**
 * VS Code extension API communication
 */

// VS Code API instance
let vscode;

/**
 * Initialize VS Code API
 */
function initVscodeApi() {
    if (window.vscode) {
        vscode = window.vscode;
    } else {
        try {
            vscode = acquireVsCodeApi();
            window.vscode = vscode;
        } catch (e) {
            console.error('Failed to acquire VS Code API', e);
        }
    }
}

/**
 * Post a message to VS Code extension
 * @param {Object} message - Message object
 */
function vscodePostMessage(message) {
    if (vscode) {
        vscode.postMessage(message);
    }
}

/**
 * Trigger new intention command
 */
function newIntention() {
    vscodePostMessage({ command: 'newIntention' });
}

/**
 * Trigger implement command for selected intent
 */
function implement() {
    if (window.GRAPH_DATA.selectedIntent) {
        vscodePostMessage({
            command: 'implement',
            intentName: window.GRAPH_DATA.selectedIntent.name
        });
    }
}

/**
 * Trigger discard command for selected intent
 */
function discard() {
    if (window.GRAPH_DATA.selectedIntent) {
        vscodePostMessage({
            command: 'discard',
            intentName: window.GRAPH_DATA.selectedIntent.name
        });
    }
}
