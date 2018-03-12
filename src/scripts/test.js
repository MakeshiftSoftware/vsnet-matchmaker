/* eslint-disable no-console */
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const r = new Redis();

r.defineCommand('match', {
  lua: fs.readFileSync(path.resolve(__dirname, './matchmaker.lua')),
  numberOfKeys: 0
});

async function test1() {
  try {
    const [match, valid] = await r.match('user-1', 15);
    const queuesJoined = await r.lrange('user-1-joined-queues', 0, -1);
    const status = await r.get('user-1-status');
    const minQueue = await r.get('user-1-min-queue');
    const maxQueue = await r.get('user-1-max-queue');

    assert.strictEqual(match, null);
    assert.strictEqual(valid, 1);
    assert.strictEqual(Number(status), 0);
    assert.strictEqual(queuesJoined.length, 1);
    assert.strictEqual(Number(queuesJoined[0]), 15);
    assert.strictEqual(Number(minQueue), 15);
    assert.strictEqual(Number(maxQueue), 15);

    await r.flushall();
    next();
  } catch (err) {
    console.log(err);
  }
}

async function test2() {
  try {
    await r.match('user-a', 15);
    const [match, valid] = await r.match('user-b', 15);
    const statusA = await r.get('user-a-status');
    const queuesJoinedA = await r.lrange('user-a-joined-queues', 0, -1);
    const minQueueA = await r.get('user-a-min-queue');
    const maxQueueA = await r.get('user-a-max-queue');
    const statusB = await r.get('user-b-status');
    const queuesJoinedB = await r.lrange('user-b-joined-queues', 0, -1);
    const minQueueB = await r.get('user-b-min-queue');
    const maxQueueB = await r.get('user-b-max-queue');

    assert.strictEqual(match, 'user-a');
    assert.strictEqual(valid, 1);
    assert.strictEqual(Number(statusA), 1);
    assert.deepEqual(queuesJoinedA, []);
    assert.strictEqual(minQueueA, null);
    assert.strictEqual(maxQueueA, null);
    assert.strictEqual(Number(statusB), 1);
    assert.deepEqual(queuesJoinedB, []);
    assert.strictEqual(minQueueB, null);
    assert.strictEqual(maxQueueB, null);

    await r.flushall();
    next();
  } catch (err) {
    console.log(err);
  }
}

const tests = [
  test1,
  test2
];

let idx = 0;

function next() {
  if (++idx === tests.length) {
    process.exit(0); // eslint-disable-line
  } else {
    tests[idx]();
  }
}

tests[0]();
