import { build } from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin'
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const resourcesDir = "resources";
const distDir = "dist";
const distLegacyDir = "dist_legacy";

const extensionBanner = `// For GNOME Shell version before 45
class Extension {
    constructor(meta) { // meta has type ExtensionMeta
      this.metadata = meta.metadata;
      this.uuid = meta.uuid;
      this.path = meta.path;
    }
    getSettings() {
        return imports.misc.extensionUtils.getSettings();
    }

    static openPrefs() {
        return imports.misc.extensionUtils.openPrefs();
    }
}

class Mtk { Rectangle }
Mtk.Rectangle = function (params = {}) {
    return new imports.gi.Meta.Rectangle(params);
};
Mtk.Rectangle.$gtype = imports.gi.Meta.Rectangle.$gtype;
`;

const extensionFooter = `
function init(meta) {
    imports.misc.extensionUtils.initTranslations();
    return new TilingShellExtension(meta);
}
`;

const prefsBanner = `// For GNOME Shell version before 45
const Config = imports.misc.config;

class ExtensionPreferences {
    constructor(metadata) {
        this.metadata = metadata;
    }

    getSettings() {
        return imports.misc.extensionUtils.getSettings();
    }
}
`;

const prefsFooter = `
function init() {
    imports.misc.extensionUtils.initTranslations();
}

function fillPreferencesWindow(window) {
    const metadata = imports.misc.extensionUtils.getCurrentExtension().metadata;
    const prefs = new TilingShellExtensionPreferences(metadata);
    prefs.fillPreferencesWindow(window);
}
`;

function preprocess(text) {
    // drop lines tagged with "// @esbuild-drop-next-line"
    text = text.replace(/\/\/\s*@esbuild-drop-next-line\s*\n.*?;/gs, '');
    return text;
}

/// Converts imports on the form
/// import { a, b, c } from 'gi://Source'
///
/// to
///
/// const Source = imports.gi;
/// and
/// const { a, b, c } = imports.gi.Source;
/// If the imported module is Mtk, it is aliased with Meta
function convertImports(text) {
    // drop import of Extension class
    text = text.replaceAll('import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";', "");

    // drop import of ExtensionPreferences class
    text = text.replaceAll('import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";', "");

    // drop import of Config from preferences
    text = text.replaceAll('import * as Config from "resource:///org/gnome/Shell/Extensions/js/misc/config.js";', "");

    // replace import of translation related code
    const regexTranslation = new RegExp(`import {(.*|\n.*)?gettext as _[^from]*[^;]*;`, 'gm');
    text = text.replaceAll(regexTranslation, "const { gettext: _, ngettext, pgettext } = imports.misc.extensionUtils;");

    const regexExportExtension = new RegExp(`export {((.|\n)*)(.+) as default((.|\n)*)};`, 'gm');
    text = text.replaceAll(regexExportExtension, "");

    // replace import Source from "gi://Source" with const Source = imports.gi.Source;
    const regexGi = new RegExp('import (.+) from \\"gi:\\/\\/(.+)\\"', 'gm');
    text = text.replaceAll(regexGi, (match, imported, module) => {
        if (module.indexOf("Mtk") >= 0) {
            // remove first occurrence of Mtk.
            // it will be defined by the extension banner
            if (imported === "Mtk") return "";
            // alias the imported Mtk with the extension banner's Mtk
            return `const ${imported} = Mtk`;
        }
        return `const ${imported} = imports.gi.${module}`;
    });

    // replace import * as Source from "resource:///org/gnome/shell/path/to/source.js"; with const Source = imports.path.to.Source;
    const regexResource = new RegExp('import \\* as (.+) from \\"resource:\\/\\/\\/org\\/gnome\\/shell\\/(.+)\\.js\\"', 'gm');
    text = text.replaceAll(regexResource, (match, imported, module) => `const ${imported} = imports.${module.replace('/', '.')}`);

    return text;
}

function printError(text) {
    console.error(`\x1b[31m${text}\x1b[0m`);
}

// build extension
build({
    logLevel: "info",
    entryPoints: ['src/extension.ts', 'src/prefs.ts'],
    outdir: distDir,
    bundle: true,
    treeShaking: false,
    // firefox60  // Since GJS 1.53.90
    // firefox68  // Since GJS 1.63.90
    // firefox78  // Since GJS 1.65.90
    // firefox91  // Since GJS 1.71.1
    // firefox102 // Since GJS 1.73.2
    target: 'firefox78',
    platform: 'node',
    format: 'esm',
    external: ['gi://*', 'resource://*'],
    plugins: [sassPlugin()],
}).then(() => {
    // copy resources directory into the build directory
    fs.renameSync(path.resolve(distDir, "extension.css"), path.resolve(distDir, "stylesheet.css"));
    fs.cpSync(resourcesDir, distDir, { recursive: true });

    const extFile = `${distDir}/extension.js`;
    // run preprocessing step
    console.log("   🛠️ ", "Preprocessing extension.js file...");
    const preprocessedExt = preprocess(fs.readFileSync(extFile).toString());
    fs.writeFileSync(extFile, preprocessedExt);

    // warn if you imported GTK libraries in GNOME Shell (Gdk, Gtk or Adw)
    console.log("   🔍", "Verifying extension.js's imports are all allowed...");
    const extensionJSContent = preprocessedExt.split('\n');
    ['Gdk', 'Gtk', 'Adw'].forEach(moduleName => {
        for (let lineNumber = 0; lineNumber < extensionJSContent.length; lineNumber++) {
            if (extensionJSContent[lineNumber].indexOf(`import ${moduleName}`) >= 0) {
                printError(`      ⚠️  ERROR: "${moduleName}" was imported in extension.js at line ${lineNumber}`);
            }
        }
    });

    const prefsFile = `${distDir}/prefs.js`;
    // run preprocessing step
    console.log("   🛠️ ", "Preprocessing prefs.js file...");
    const preprocessedPrefs = preprocess(fs.readFileSync(prefsFile).toString());
    fs.writeFileSync(prefsFile, preprocessedPrefs);

    // warn if you imported GNOME Shell libraries in Preferences (Clutter, Meta, St or Shell)
    console.log("   🔍", "Verifying prefs.js's imports are all allowed...");
    const prefsJSContent = preprocessedPrefs.split('\n');
    ['Clutter', 'Meta', 'Mtk', 'St', 'Shell'].forEach(moduleName => {
        for (let lineNumber = 0; lineNumber < prefsJSContent.length; lineNumber++) {
            if (prefsJSContent[lineNumber].indexOf(`import ${moduleName}`) >= 0) {
                printError(`      ⚠️  ERROR: "${moduleName}" was imported in prefs.js at line ${lineNumber}`);
            }
        }
    });
}).then(async () => {
    console.log("   💡", "Generating legacy version...");

    // duplicate the build into distLegacyDir
    fs.cpSync(distDir, distLegacyDir, { recursive: true });

    // for each js file in distLegacyDir, apply conversion
    const files = await glob(`${distLegacyDir}/**/*.js`, {});
    for (let file of files) {
        let jsFileContent = fs.readFileSync(file).toString();
        let convertedContent = convertImports(jsFileContent);
        if (file.indexOf("extension.js") >= 0) {
            fs.writeFileSync(file, `${extensionBanner}${convertedContent}${extensionFooter}`);
        } else if (file.indexOf("prefs.js") >= 0) {
            fs.writeFileSync(file, `${prefsBanner}${convertedContent}${prefsFooter}`);
        } else {
            fs.writeFileSync(file, convertedContent);
        }
    }
    const metadataFile = path.resolve(resourcesDir, 'metadata.json');
    const metadataJson = JSON.parse(fs.readFileSync(metadataFile));
    const legacyShellVersions = metadataJson["shell-version"].filter(version => Number(version) <= 44);
    const nonLegacyShellVersions = metadataJson["shell-version"].filter(version => Number(version) > 44);

    // remove legacy versions from main version's metadata file
    console.log("   🚀", "Updating metadata.json file...");
    metadataJson["shell-version"] = nonLegacyShellVersions;
    fs.writeFileSync(path.resolve(distDir, 'metadata.json'), JSON.stringify(metadataJson, null, 4));

    // keep legacy versions only in the legacy extension's metadata file
    metadataJson["shell-version"] = legacyShellVersions;
    fs.writeFileSync(path.resolve(distLegacyDir, 'metadata.json'), JSON.stringify(metadataJson, null, 4));
    console.log();
    console.log("📁 ", "Main version directory:  ", distDir);
    console.log("📁 ", "Legacy version directory:", distLegacyDir);
    console.log("📖 ", "Main version for GNOME Shells:  ", nonLegacyShellVersions);
    console.log("📖 ", "Legacy version for GNOME Shells:", legacyShellVersions);
});
