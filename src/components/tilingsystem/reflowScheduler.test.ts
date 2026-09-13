import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReflowScheduler } from './reflowScheduler.ts';

test('runs the reflow synchronously when idle', () => {
    let idleQueued = 0;
    const s = new ReflowScheduler(() => idleQueued++);
    let ran = 0;
    assert.equal(
        s.run(() => ran++),
        'ran',
    );
    assert.equal(ran, 1);
    assert.equal(idleQueued, 0);
    assert.equal(s.isRunning, false);
});

test('(vii) a nested request during a reflow is deferred to one idle follow-up', () => {
    let idleQueued = 0;
    const s = new ReflowScheduler(() => idleQueued++);
    const placed: string[] = [];
    const nested: string[] = [];
    s.run(() => {
        for (const w of ['A', 'B', 'C']) {
            placed.push(w);
            if (w === 'B') {
                // B's position-changed handler releases it and asks for a reflow
                nested.push(s.run(() => placed.push('nested')));
                nested.push(s.run(() => placed.push('nested')));
            }
        }
    });
    assert.deepEqual(placed, ['A', 'B', 'C'], 'outer pass completes untouched');
    assert.deepEqual(nested, ['deferred', 'deferred']);
    assert.equal(idleQueued, 1, 'exactly one follow-up');
    assert.equal(s.isRunning, false);
});

test('a throwing reflow leaves the scheduler usable', () => {
    const s = new ReflowScheduler(() => {});
    assert.throws(() =>
        s.run(() => {
            throw new Error('boom');
        }),
    );
    assert.equal(s.isRunning, false);
    assert.equal(
        s.run(() => {}),
        'ran',
    );
});
