import { build } from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin'
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { glob } from 'glob';
import parser from '@babel/parser';
import types from '@babel/types';
import traverseBabel from '@babel/traverse';
import generatorBabel from '@babel/generator';
import { ESLint } from "eslint";

const traverse = traverseBabel.default;
const generator = generatorBabel.default;

const resourcesDir = "resources";
const distDir = "dist";
const distLegacyDir = "dist_legacy";

const globalBanner = `// For GNOME Shell version before 45
const Me = imports.misc.extensionUtils.getCurrentExtension();
`;

const mtkDefinition = `// For GNOME Shell version before 45
var Mtk = class { Rectangle }
Mtk.Rectangle = function (params = {}) {
    return new imports.gi.Meta.Rectangle(params);
};
Mtk.Rectangle.$gtype = imports.gi.Meta.Rectangle.$gtype;
`;

const polyfillBanner = `// For GNOME Shell version before 45
var Extension = class {
    constructor(meta) { // meta has type ExtensionMeta
      this.metadata = meta.metadata;
      this.uuid = meta.uuid;
      this.path = meta.path;
    }
    getSettings() {
        return imports.misc.extensionUtils.getSettings();
    }

    openPreferences() {
        return imports.misc.extensionUtils.openPrefs();
    }
}
`;

const extensionFooter = `// For GNOME Shell version before 45
function init(meta) {
    imports.misc.extensionUtils.initTranslations();
    return new TilingShellExtension(meta);
}
`;

const prefsBanner = `// For GNOME Shell version before 45
const Me = imports.misc.extensionUtils.getCurrentExtension();
class ExtensionPreferences {
    constructor(metadata, path) {
        this.metadata = metadata;
        this.path = path;
    }

    getSettings() {
        return imports.misc.extensionUtils.getSettings();
    }
}
`;

const prefsFooter = `// For GNOME Shell version before 45
function init() {
    imports.misc.extensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
    const metadata = imports.misc.extensionUtils.getCurrentExtension().metadata;
    const prefs = new TilingShellExtensionPreferences(metadata, Me.dir.get_path());
    prefs.fillPreferencesWindow(window);
}
`;

async function preprocess(files) {
    const eslint = new ESLint({
        fix: true,
    });
    await Promise.all(files.map(async (filename) => {
        let text = fsSync.readFileSync(filename, 'utf-8');

        // drop lines tagged with "// @esbuild-drop-next-line"
        text = text.replace(/\/\/\s*@esbuild-drop-next-line\s*\n.*?;/gs, '');

        // Ensure every import has ".js" at end end, excluding GJS imports
        text = text.replace(
            /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g,
            (_match, imports, importPath) => {
                if (!importPath.endsWith('.js') && !importPath.startsWith('gi://')) {
                    importPath += '.js';
                }
                return `import ${imports} from "${importPath}"`;
            }
        );

        // Run ESLint on the file
        const lintResults = await eslint.lintText(text, { filePath: filename });
        text = lintResults.length > 0 ? lintResults[0].output || text : text;

        // Check if there are remaining errors
        const hasErrors = lintResults.some((r) =>
            r.messages.some((m) => m.severity === 2),
        );

        if (hasErrors) {
            const formatter = await eslint.loadFormatter("stylish");
            const output = formatter.format(lintResults);
            console.error(output);
        }

        fsSync.writeFileSync(filename, text, 'utf-8');
    }));
}

/**
 * Transforms modern ES module imports/exports into the legacy format
 * required by GNOME Shell extensions.
 *
 * ### What it does
 * 1. Converts `import` statements such as:
 *    ```js
 *    import { a, b, c } from "gi://Source";
 *    ```
 *    into:
 *    ```js
 *    const Source = imports.gi.Source;
 *    const { a, b, c } = imports.gi.Source;
 *    ```
 *
 * 2. Handles `resource:///` imports:
 *    ```js
 *    import * as Foo from "resource:///org/gnome/shell/misc/foo.js";
 *    ```
 *    → `const Foo = imports.misc.foo;`
 *
 * 3. Resolves relative imports to `Me.imports.<path>`:
 *    ```js
 *    import Bar from "./utils/bar.js";
 *    ```
 *    → `const Bar = Me.imports.utils.bar.Bar;`
 *
 * 4. Removes specific unused GNOME imports:
 *    - `extension.js`
 *    - `prefs.js`
 *    - `config.js`
 *
 * 5. Converts top-level `const` and `let` declarations to `var` for
 *    compatibility with the GNOME Shell JS engine.
 *
 * 6. Converts top-level `class` declarations to:
 *    ```js
 *    var MyClass = class extends BaseClass { ... };
 *    ```
 *
 * 7. Drops ES `export` statements, since GNOME Shell expects no exports.
 *
 * 8. Special-cases the `Mtk` import: replaces
 *    ```js
 *    var Mtk = imports.gi.Mtk;
 *    ```
 *    with a custom object that aliases `Mtk.Rectangle` to `Meta.Rectangle`.
 *
 * @param {string} text – The source code to transform.
 * @param {string} currentFilePath – Absolute path of the file being processed.
 * @param {string} rootDirName – Absolute path to the project’s root directory.
 * @returns {string} – The transformed, GNOME-compatible code.
 */
function convertImports(text, currentFilePath, rootDirName) {
    const dropImports = [
        "resource:///org/gnome/shell/extensions/extension.js",
        "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js",
        "resource:///org/gnome/Shell/Extensions/js/misc/config.js"
    ];

    text = text
        // translation import → const { gettext: _, ngettext, pgettext }
        .replace(
            /import\s*\{[^}]*gettext\s+as\s+_[^}]*\}[^;]*;/gm,
            "const { gettext: _, ngettext, pgettext } = imports.misc.extensionUtils;"
        )
        // generic gi:// import → const X = imports.gi.X
        .replace(
            /import\s+(.+)\s+from\s+"gi:\/\/(.+)";/gm,
            (_, imported, module) => `const ${imported} = imports.gi.${module}`
        )
        // resource import → const X = imports.path.to.X
        .replace(
            /import\s+\*\s+as\s+(.+)\s+from\s+"resource:\/\/\/org\/gnome\/shell\/(.+)\.js";/gm,
            (_, imported, module) => `const ${imported} = imports.${module.replace(/\//g, '.')}`
        );

    // replace import of Config
    text = text.replaceAll('import * as Config from "resource:///org/gnome/Shell/Extensions/js/misc/config.js";', "const Config = imports.misc.config;");

    // handle relative imports
    const relativeCurrent = currentFilePath.replace(
        new RegExp(`^${rootDirName}[\\\\/]`), ''
    );

    text = text.replace(
        /import\s+(?:\{([\s\S]+?)\}|([^\s]+))\s+from\s+"([\.]{1,2}\/[^"]+)";/gm,
        (_, destructured, single, importPath) => {
            const currentAbs = path.resolve(rootDirName, relativeCurrent);
            const fullPath = path.resolve(path.dirname(currentAbs), importPath).replace(/\.(js|ts)$/, '');
            const relativeModule = path.relative(rootDirName, fullPath).replace(/\\/g, '/').split('/').join('.');

            if (destructured) {
                return destructured
                    .split(',')
                    .map(i => i.trim())
                    .filter(Boolean)
                    .map(v => `const ${v} = Me.imports.${relativeModule}.${v};`)
                    .join('\n');
            } else {
                return `const ${single} = Me.imports.${relativeModule}.${single};`;
            }
        }
    );

    const ast = parser.parse(text, {
        sourceType: 'module',
        plugins: ["exportDefaultFrom", "exportNamespaceFrom", "classProperties"]
    });

    traverse(ast, {
        ImportDeclaration(path) {
            if (dropImports.includes(path.node.source.value)) path.remove();
        },
        enter(path) {
            // top-level const/let → var
            if (path.isVariableDeclaration() && path.parent.type === 'Program') {
                if (path.node.kind === 'const' || path.node.kind === 'let') path.node.kind = 'var';
            }

            // top-level class → var = class ...
            if (path.isClassDeclaration() && path.parent.type === 'Program') {
                path.node.type = 'VariableDeclaration';
                path.node.kind = 'var';
                path.node.declarations = [
                    types.variableDeclarator(
                        path.node.id,
                        types.classExpression(
                            path.node.id,
                            path.node.superClass,
                            path.node.body,
                            []
                        )
                    )
                ];

                delete path.node.id;
                delete path.node.superClass;
                delete path.node.body;
            }

            // remove exports
            if (path.isExportNamedDeclaration() || path.isExportDefaultDeclaration()) path.remove();
        }
    });

    text = generator(ast, { retainLines: true }).code;

    // handle Mtk replacement
    text = text.replace(/^(var|let|const)\s+Mtk\s*=\s*imports\.gi\.Mtk\s*;\s*$/m, mtkDefinition);

    return text;
}

function printError(text) {
    console.error(`\x1b[31m${text}\x1b[0m`);
}

async function processLegacyFiles(files) {
    await Promise.all(files.map(async (filePath) => {
        const jsFileContent = await fs.readFile(filePath, 'utf-8');
        const convertedContent = convertImports(jsFileContent, filePath, distLegacyDir);

        // append banners
        let finalContent;
        if (filePath.includes("extension.js")) {
            finalContent = `${globalBanner}${convertedContent}${extensionFooter}`;
        } else if (filePath.includes("polyfill.js")) {
            finalContent = `${polyfillBanner}${convertedContent}`;
        } else if (filePath.includes("prefs.js")) {
            finalContent = `${prefsBanner}${convertedContent}${prefsFooter}`;
        } else if (!filePath.includes("monitorDescription.js")) { // add global banner to everyfile but not to monitorDescription.js
            finalContent = `${globalBanner}${convertedContent}`;
        } else {
            finalContent = convertedContent;
        }

        await fs.writeFile(filePath, finalContent, 'utf-8');
    }));
}

// build extension
build({
    logLevel: "info",
    entryPoints: ['src/**/*.ts', 'src/styles/stylesheet.scss', 'src/styles/prefs.scss', 'src/prefs.ts'],
    outdir: distDir,
    bundle: false,
    treeShaking: false,
    target: 'firefox78',
    platform: 'node',
    format: 'esm',
    plugins: [sassPlugin()],
}).then(async () => {
    const excludedFiles = [ // paths relative to dist directory
        './ambient.d.js', // not needed in the build
        './indicator/currentMenu.js', // it is empty
        './components/tilepreview/blurTilePreview.js', // not used, but Shexli complains
        './components/tilingsystem/extendedWindow.js' // it is empty
    ];
    excludedFiles.forEach(file => {
        fsSync.rmSync(path.resolve(distDir, file), { recursive: true, force: true });
    });

    // Post-build sync steps
    fsSync.renameSync(path.resolve(distDir, "styles/stylesheet.css"), path.resolve(distDir, "stylesheet.css"));
    fsSync.cpSync(resourcesDir, distDir, { recursive: true });
    fsSync.renameSync(path.resolve(distDir, "styles/prefs.css"), path.resolve(distDir, "prefs.css"));
    fsSync.cpSync(resourcesDir, distDir, { recursive: true });

    // preprocess extension files in parallel
    console.log("   🛠️ ", "Preprocessing extension files...");
    const generatedFiles = await glob(`${distDir}/**/*.js`, {});
    await preprocess(generatedFiles);

    // run both verifications in parallel
    console.log("   🔍", "Verifying imports...");
    const verification = Promise.all(generatedFiles.map(f => {
        if (f.includes('prefs.js')) verifyImports(['Clutter', 'Meta', 'Mtk', 'St', 'Shell'], f);
        else verifyImports(['Gdk', 'Gtk', 'Adw'], f);
    }));

    // Legacy version generation, for GNOME Shell <= 44
    console.log("   💡", "Generating legacy version...");
    fsSync.cpSync(distDir, distLegacyDir, { recursive: true });

    const files = await glob(`${distLegacyDir}/**/*.js`, {});
    const metadataJson = await fs.readFile(path.resolve(resourcesDir, 'metadata.json')).then(JSON.parse);

    // prepare metadata updates
    const legacyShellVersions = metadataJson["shell-version"].filter(v => +v <= 44);
    const nonLegacyShellVersions = metadataJson["shell-version"].filter(v => +v > 44);

    // in parallel: update metadata, wait for verification, process files to create legacy version
    await Promise.all([
        verification,
        fs.writeFile(
            path.join(distDir, 'metadata.json'),
            JSON.stringify({ ...metadataJson, 'shell-version': nonLegacyShellVersions }, null, 4)
        ),
        fs.writeFile(
            path.join(distLegacyDir, 'metadata.json'),
            JSON.stringify({ ...metadataJson, 'shell-version': legacyShellVersions }, null, 4)
        ),
        processLegacyFiles(files)   // convert all JS files to support legacy GNOME
    ]);

    // keep legacy versions only in the legacy extension's metadata file
    metadataJson["shell-version"] = legacyShellVersions;
    fsSync.writeFileSync(path.resolve(distLegacyDir, 'metadata.json'), JSON.stringify(metadataJson, null, 4));
    console.log();
    console.log("📁 ", "Main version directory:  ", distDir);
    console.log("📁 ", "Legacy version directory:", distLegacyDir);
    console.log("📖 ", "Main version for GNOME Shells:  ", nonLegacyShellVersions);
    console.log("📖 ", "Legacy version for GNOME Shells:", legacyShellVersions);
});

function verifyImports(modules, fileName) {
    return new Promise(resolve => {
        if (fileName.includes("monitorDescription.js")) {
            resolve();
            return;
        }

        const content = fsSync.readFileSync(fileName, 'utf-8');
        const lines = content.split('\n');
        modules.forEach(m => {
            lines.forEach((line, i) => {
                if (line.includes(`import ${m}`)) {
                    printError(`      ⚠️  WARNING: "${m}" was imported in ${fileName} at line ${i}`);
                }
            });
        });
        resolve();
    });
}
