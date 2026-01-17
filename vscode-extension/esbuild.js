const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

const buildOptions = {
    entryPoints: [path.join(__dirname, 'webview', 'index.tsx')],
    bundle: true,
    outfile: path.join(__dirname, 'out', 'webview.js'),
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    minify: !isWatch,
    sourcemap: isWatch ? 'inline' : false,
    jsx: 'automatic',
    jsxImportSource: 'preact',
    loader: {
        '.tsx': 'tsx',
        '.ts': 'ts',
    },
    define: {
        'process.env.NODE_ENV': isWatch ? '"development"' : '"production"',
    },
};

if (isWatch) {
    esbuild.context(buildOptions).then((ctx) => {
        ctx.watch();
        console.log('Watching webview for changes...');
    }).catch(() => process.exit(1));
} else {
    esbuild.build(buildOptions).catch(() => process.exit(1));
}
