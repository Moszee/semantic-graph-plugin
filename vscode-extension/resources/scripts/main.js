/**
 * Main entry point for intent graph visualization
 * Initializes all modules and sets up event listeners
 */

(function () {
    'use strict';

    const init = () => {
        // Initialize VS Code API
        initVscodeApi();

        // Get DOM elements
        const canvasContainer = document.getElementById('canvasContainer');
        // Check if graph wrapper exists (it should if container exists)
        if (!canvasContainer) {
            console.error('Canvas container not found despite ready event');
            return;
        }

        // Initialize node positions from layout algorithm
        if (window.GRAPH_DATA && window.GRAPH_DATA.nodes) {
            const positions = initializeNodePositions(window.GRAPH_DATA.nodes);
            setNodePositions(positions);

            // Initial render
            renderNodes(window.GRAPH_DATA.nodes, window.GRAPH_DATA.deltaNodeIds);

            // Draw edges after a short delay to ensure DOM is ready
            setTimeout(() => {
                drawEdges(window.GRAPH_DATA.nodes, getNodePositions());
            }, 150);

            // Redraw edges again after a longer delay to catch any late-rendering nodes
            setTimeout(() => {
                drawEdges(window.GRAPH_DATA.nodes, getNodePositions());
            }, 500);
        }

        // Set up event listeners
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        canvasContainer.addEventListener('mousedown', startPan);
        canvasContainer.addEventListener('wheel', onWheel, { passive: false });

        // Redraw edges on window resize
        window.addEventListener('resize', () => {
            if (window.GRAPH_DATA && window.GRAPH_DATA.nodes) {
                drawEdges(window.GRAPH_DATA.nodes, getNodePositions());
            }
        });

        // Make functions globally available for inline event handlers
        window.newIntention = newIntention;
        window.implement = implement;
        window.discard = discard;
        window.zoomIn = zoomIn;
        window.zoomOut = zoomOut;
    };

    if (document.getElementById('canvasContainer')) {
        init();
    } else {
        window.addEventListener('graph-container-ready', init);
    }
})();
