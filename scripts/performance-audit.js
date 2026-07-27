'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const model = require('../src/core/score-model');
const airscore = require('../src/core/airscore');
const formats = require('../src/core/formats');
const layout = require('../src/core/layout-engine');
const engineApi = require('../src/composer3/engine-api');

const root = path.resolve(__dirname, '..');
const validation = path.join(root, 'validation');
fs.mkdirSync(validation, { recursive: true });

function measure(name, operation) {
  const started = performance.now();
  const value = operation();
  const elapsedMs = performance.now() - started;
  return { name, elapsedMs, value };
}

async function main() {
  const score = model.createScore({
    template: 'lead',
    measures: 2000,
    timeSignature: '4/4',
    autoFillRests: false,
    title: 'Large Score Reliability Audit'
  });
  const part = score.parts[0];
  for (let index = 0; index < 1000; index += 1) {
    model.addNote(score, part.id, {
      midi: 60 + (index % 12),
      start: index * 4,
      duration: 1,
      voice: (index % 4) + 1,
      velocity: 88,
      inputSource: 'performance-audit'
    });
  }

  const timings = [];
  timings.push(measure('100000-measure-lookups', () => {
    let checksum = 0;
    const total = model.totalBeats(score);
    for (let index = 0; index < 100000; index += 1) {
      checksum += model.measureIndexAt(score, (index * 0.319) % total);
    }
    return checksum;
  }));

  let serialized = '';
  timings.push(measure('airscore-serialize', () => {
    serialized = airscore.serialize(score);
    return serialized.length;
  }));

  timings.push(measure('airscore-deserialize', () => {
    const reopened = airscore.deserialize(serialized);
    return reopened.parts.reduce((sum, item) => sum + item.events.length, 0);
  }));

  let xml = '';
  timings.push(measure('musicxml-export', () => {
    xml = formats.exportMusicXML(score);
    return xml.length;
  }));

  timings.push(measure('layout-plan', () => {
    const plan = layout.buildSystemPlan(score, { staffX: 120, availableWidth: 1000, maxMeasures: 8 });
    return plan.systems?.length || plan.length || 0;
  }));

  timings.push(measure('rapid-semantic-entry', () => {
    const engine = engineApi.createEngine({ measures: 256, autoFillRests: false });
    for (let index = 0; index < 250; index += 1) {
      engine.addPianoChord([60 + (index % 12), 64 + (index % 12), 67 + (index % 12)], {
        start: index * 0.25,
        duration: 0.25,
        voice: (index % 4) + 1,
        advance: false,
        inputSource: 'stress-test'
      });
    }
    return engine.score.parts.reduce((sum, item) => sum + item.events.length, 0);
  }));

  const thresholds = {
    '100000-measure-lookups': 2000,
    'airscore-serialize': 2500,
    'airscore-deserialize': 3500,
    'musicxml-export': 5000,
    'layout-plan': 4000,
    'rapid-semantic-entry': 8000
  };

  const checks = timings.map(item => ({
    name: item.name,
    status: item.elapsedMs <= thresholds[item.name] ? 'PASS' : 'FAIL',
    elapsedMs: Number(item.elapsedMs.toFixed(3)),
    thresholdMs: thresholds[item.name],
    result: item.value
  }));
  const report = {
    product: 'Airmonlink Composer 3',
    version: '1.1.9',
    buildNumber: 29,
    githubEmbargoStatus: 'ACTIVE',
    platform: process.platform,
    node: process.version,
    createdUtc: new Date().toISOString(),
    score: { measures: score.measures.length, events: part.events.length },
    checks,
    status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL'
  };
  fs.writeFileSync(path.join(validation, 'performance-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Performance audit ${report.status}: ${checks.length}/${checks.length} checks recorded.`);
  for (const item of checks) console.log(`${item.status} ${item.name}: ${item.elapsedMs} ms (limit ${item.thresholdMs} ms)`);
  if (report.status !== 'PASS') process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
