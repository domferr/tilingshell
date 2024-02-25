import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import cleanup from 'rollup-plugin-cleanup';
import copy from 'rollup-plugin-copy';
import styles from 'rollup-plugin-styles';
import visualizer from 'rollup-plugin-visualizer';

const buildPath = 'dist';

const globals = {
    '@gi-types/gio2': 'imports.gi.Gio',
    '@gi-types/gtk4': 'imports.gi.Gtk',
    '@gi-types/glib2': 'imports.gi.GLib',
    '@gi-types/st1': 'imports.gi.St',
    '@gi-types/shell0': 'imports.gi.Shell',
    '@gi-types/meta10': 'imports.gi.Meta',
    '@gi-types/gobject2': 'imports.gi.GObject',
    '@gi-types/clutter10': 'imports.gi.Clutter',
};

const external = [...Object.keys(globals)/*, thirdParty*/];

const extensionBanner = `
try {
`;

const extensionFooter = `
}
catch(err) {
  log(\`[modernwindowmanager] [init] \$\{err\}\ Stack trace:\n\$\{err.stack\}\`);
  imports.ui.main.notify('modernwindowmanager', \`\$\{err\}\`);
  throw err;
}
`;

export default [
    /*...thirdPartyBuild,*/
    {
        input: 'src/extension.ts',
        treeshake: {
            moduleSideEffects: 'no-external',
        },
        output: {
            file: `${buildPath}/extension.js`,
            format: 'iife',
            name: 'init',
            banner: extensionBanner,
            footer: extensionFooter,
            exports: 'default',
            globals,
            assetFileNames: '[name][extname]',
        },
        external,
        plugins: [
            commonjs(),
            nodeResolve({
                preferBuiltins: false,
            }),
            typescript({
                tsconfig: './tsconfig.json',
            }),
            styles({
                mode: ['extract', `stylesheet.css`],
            }),
            copy({
                targets: [
                    { src: './resources/icons', dest: `${buildPath}` },
                    { src: './resources/metadata.json', dest: `${buildPath}` },
                    { src: './resources/schemas', dest: `${buildPath}` },
                    /*{ src: './resources/dbus', dest: `${buildPath}` },*/
                ],
            }),
            cleanup({
                comments: 'none',
            }),
            visualizer(),
        ],
    },
];