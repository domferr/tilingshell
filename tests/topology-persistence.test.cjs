const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (actual, expected) => assert.deepEqual(clone(actual), expected);
const laptop = { x: 0, y: 0, width: 1920, height: 1080, geometryScale: 1 };
const external = { ...laptop, x: 1920, width: 2560, height: 1440 };
const initialSelections = [
    ['A', 'B'],
    ['B', 'C'],
    ['C', 'A'],
];

class Signals {
    listeners = new Map();
    nextId = 0;

    connect(key, callback) {
        const id = ++this.nextId;
        this.listeners.set(id, { key, callback });
        return id;
    }

    disconnect(id) {
        this.listeners.delete(id);
    }

    emit(key, ...args) {
        for (const listener of [...this.listeners.values()]) {
            if (listener.key === key) listener.callback(this, ...args);
        }
    }
}

class Variant {
    constructor(value) {
        this.value = clone(value);
    }
    n_children() {
        return this.value.length;
    }
    get_child_value(index) {
        return new Variant(this.value[index]);
    }
    get_string() {
        return [this.value];
    }
    static new_strv(value) {
        return new Variant(value);
    }
    static new_array(_, values) {
        return new Variant(values.map(value => value.value));
    }
}

// Run the real TypeScript classes with in-memory GSettings and GNOME signals.
// No installed extension or user settings are modified by these tests.
function fixture() {
    const defaults = {
        'layouts-json': JSON.stringify(
            ['A', 'B', 'C'].map(id => ({ id, tiles: [{}] }))
        ),
        'selected-layouts': initialSelections,
        'selected-layouts-by-topology': '{}',
        'sync-layout-across-workspaces': false,
    };
    class MemorySettings extends Signals {
        values = clone(defaults);
        writes = 0;

        bind() {}
        get_string(key) {
            return this.values[key];
        }
        get_boolean(key) {
            return this.values[key];
        }
        get_value(key) {
            return new Variant(this.values[key]);
        }
        set_string(key, value) {
            return this.set(key, value);
        }
        set_boolean(key, value) {
            return this.set(key, value);
        }
        set_value(key, value) {
            return this.set(key, value.value);
        }
        reset(key) {
            return this.set(key, defaults[key]);
        }

        set(key, value) {
            if (JSON.stringify(this.values[key]) === JSON.stringify(value))
                return true;
            this.writes++;
            this.values[key] = clone(value);
            this.emit(`changed::${key}`);
            return true;
        }
    }
    const workspaceManager = new Signals();
    let workspaces = Array.from({ length: 3 }, () => {
        const workspace = { index: () => workspaces.indexOf(workspace) };
        return workspace;
    });
    workspaceManager.get_n_workspaces = () => workspaces.length;
    workspaceManager.get_workspace_by_index = index => workspaces[index];
    workspaceManager.get_active_workspace_index = () => 0;
    const Main = {
        layoutManager: {
            monitors: clone([laptop, external]),
            primaryIndex: 0,
            getWorkAreaForMonitor: index => Main.layoutManager.monitors[index],
        },
    };
    const gi = {
        Gio: { Settings: MemorySettings, SettingsBindFlags: { GET: 1 } },
        GLib: { Variant },
        GObject: {
            Object: Signals,
            ParamSpec: { uint: () => ({}) },
            ParamFlags: { READWRITE: 1 },
        },
    };
    const modules = new Map();
    function load(filename) {
        filename = path.resolve(root, filename);
        if (modules.has(filename)) return modules.get(filename).exports;
        const module = { exports: {} };
        modules.set(filename, module);
        const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.CommonJS,
            },
        }).outputText;
        const requireMock = specifier => {
            if (specifier.includes('/gi/')) return gi;
            if (specifier === 'resource:///org/gnome/shell/ui/main.js')
                return Main;
            if (specifier.endsWith('/gjs'))
                return { registerGObjectClass() {} };
            if (specifier.endsWith('/logger'))
                return { logger: () => () => {} };
            if (specifier.endsWith('/ui')) return { getWindows: () => [] };
            return load(
                path.resolve(path.dirname(filename), specifier + '.ts')
            );
        };
        vm.runInNewContext(
            `(function(require, module, exports) {${source}\n})`,
            {
                global: { workspaceManager },
            },
            { filename }
        )(requireMock, module, module.exports);
        return module.exports;
    }
    const Settings = load('src/settings/settings.ts').default;
    const GlobalState = load('src/utils/globalState.ts').default;
    const backend = new MemorySettings();
    Settings.initialize(backend);
    GlobalState.get();
    const extension = {
        _tilingManagers: [{}, {}],
        rebuilds: 0,
        _createTilingManagers() {
            this.rebuilds++;
            this._tilingManagers = Main.layoutManager.monitors.map(() => ({}));
        },
    };
    // Evaluate actual UI callbacks without constructing GNOME's UI widgets.
    const onWorkareasChanged = loadCallback(
        'src/extension.ts',
        node =>
            ts.isCallExpression(node) &&
            node.arguments.some(
                arg =>
                    ts.isStringLiteral(arg) && arg.text === 'workareas-changed'
            ),
        { Main, GlobalState, getMonitors: () => Main.layoutManager.monitors },
        extension
    );
    const resetLayouts = loadCallback(
        'src/prefs.ts',
        node =>
            ts.isVariableDeclaration(node) &&
            node.name.getText() === 'resetBtn',
        { Settings }
    );
    return {
        Main,
        Settings,
        GlobalState,
        backend,
        extension,
        resetLayouts,
        selected: () => clone(Settings.get_selected_layouts()),
        topology: () => clone(Settings.get_selected_layouts_by_topology()),
        select: (id, monitor = 0) =>
            GlobalState.get().setSelectedLayoutOfMonitor(id, monitor),
        changeMonitors(monitors) {
            Main.layoutManager.monitors = clone(monitors);
            onWorkareasChanged();
        },
        restart() {
            GlobalState.destroy();
            GlobalState.get();
        },
        reorderWorkspaces() {
            workspaces = [workspaces[2], workspaces[0], workspaces[1]];
            workspaceManager.emit('workspaces-reordered');
        },
    };
}

function loadCallback(filename, matches, context, receiver = {}) {
    const source = ts.createSourceFile(
        filename,
        fs.readFileSync(path.join(root, filename), 'utf8'),
        ts.ScriptTarget.Latest,
        true
    );
    let callback;
    function visit(node) {
        if (matches(node)) {
            const call = ts.isVariableDeclaration(node)
                ? node.initializer
                : node;
            callback = call.arguments.find(ts.isArrowFunction);
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(callback, `Callback not found in ${filename}`);
    return vm.runInNewContext(
        `(function() { return ${callback.getText(source)}; }).call(receiver)`,
        { ...context, receiver }
    );
}

test('initial selections migrate into topology storage and survive restart', () => {
    const f = fixture();
    equal(f.selected(), initialSelections);
    equal(Object.values(f.topology()), [initialSelections]);
    f.restart();
    equal(f.selected(), initialSelections);
});

test('disconnect and reconnect preserve distinct laptop and docked selections', () => {
    const f = fixture();
    f.changeMonitors([laptop]);
    f.select('B');
    const laptopSelections = f.selected();
    f.changeMonitors([laptop, external]);
    equal(f.selected(), initialSelections);
    f.changeMonitors([laptop]);
    equal(f.selected(), laptopSelections);
});

for (const [description, monitor] of [
    ['resolution', { ...external, width: 3440, height: 1440 }],
    ['position', { ...external, x: 0, y: 1080 }],
    ['scale', { ...external, geometryScale: 2 }],
]) {
    test(`${description} change with the same monitor count restores saved layouts`, () => {
        const f = fixture();
        f.changeMonitors([laptop, monitor]);
        assert.equal(f.extension.rebuilds, 1);
        f.select('C', 0);
        f.select('A', 1);
        const changedSelections = f.selected();
        f.changeMonitors([laptop, external]);
        equal(f.selected(), initialSelections);
        f.changeMonitors([laptop, monitor]);
        equal(f.selected(), changedSelections);
        assert.equal(f.extension.rebuilds, 3);
    });
}

test('monitor enumeration reorder remaps each workspace to the same physical positions', () => {
    const f = fixture();
    f.changeMonitors([external, laptop]);
    equal(f.selected(), [
        ['B', 'A'],
        ['C', 'B'],
        ['A', 'C'],
    ]);
    assert.equal(f.extension.rebuilds, 1);
    f.changeMonitors([laptop, external]);
    equal(f.selected(), initialSelections);
});

test('work-area-only changes update managers without restoring layouts or writing settings', () => {
    const f = fixture();
    const workArea = { ...laptop, y: 32, height: 1048 };
    f.Main.layoutManager.getWorkAreaForMonitor = () => workArea;
    const before = f.backend.writes;
    f.changeMonitors([laptop, external]);
    assert.equal(f.extension.rebuilds, 0);
    assert.equal(f.backend.writes, before);
    assert.equal(f.extension._tilingManagers[0].workArea, workArea);
    equal(f.selected(), initialSelections);
});

test('upstream workspace syncing persists through monitor changes and restart', () => {
    const f = fixture();
    f.Settings.SYNC_LAYOUT_ACROSS_WORKSPACES = true;
    f.select('C', 1);
    const expected = [
        ['A', 'C'],
        ['B', 'C'],
        ['C', 'C'],
    ];
    equal(f.selected(), expected);
    f.changeMonitors([laptop]);
    f.changeMonitors([laptop, external]);
    f.restart();
    equal(f.selected(), expected);
});

test('workspace reordering is saved for the current topology', () => {
    const f = fixture();
    f.reorderWorkspaces();
    f.restart();
    equal(f.selected(), [
        initialSelections[2],
        initialSelections[0],
        initialSelections[1],
    ]);
});

test('Reset layouts clears active and inactive topology selections across restart and reconnect', () => {
    const f = fixture();
    f.changeMonitors([laptop]);
    f.select('C');
    assert.equal(Object.keys(f.topology()).length, 2);
    f.resetLayouts();
    const defaultId = f.Settings.get_layouts_json()[0].id;
    equal(f.selected(), [[defaultId], [defaultId], [defaultId]]);
    assert.equal(Object.keys(f.topology()).length, 0);
    f.restart();
    equal(f.selected(), [[defaultId], [defaultId], [defaultId]]);
    f.changeMonitors([laptop, external]);
    equal(
        f.selected(),
        Array.from({ length: 3 }, () => [defaultId, defaultId])
    );
    f.restart();
    equal(
        f.selected(),
        Array.from({ length: 3 }, () => [defaultId, defaultId])
    );
});

test('malformed topology JSON is reset safely', () => {
    const f = fixture();
    f.backend.set_string('selected-layouts-by-topology', '{bad json');
    equal(f.topology(), {});
    assert.equal(f.backend.get_string('selected-layouts-by-topology'), '{}');
});
