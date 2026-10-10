'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { assertConfigMatchesSchema } = require('./survey-schema');

const publicPath = path.join(__dirname, '../dist/r-xiyedm7aw0l/config.json');
const config = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
assertConfigMatchesSchema(config);
const privateConfig = require('./survey-private.json');
const ids = config.stimuli.map((s) => s.id).sort();
if (JSON.stringify(ids) !== JSON.stringify(Object.keys(privateConfig.stimulusConditions).sort()) ||
    ids.some((id) => !['A', 'B'].includes(privateConfig.stimulusConditions[id]))) {
  throw new Error('Survey private stimulus mapping mismatch');
}
fs.writeFileSync(path.join(__dirname, 'survey-config.json'), JSON.stringify(config, null, 2) + '\n');
