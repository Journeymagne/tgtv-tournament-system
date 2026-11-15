const { parentPort, workerData } = require('node:worker_threads');
try {
  let value;
  if (workerData.operation === 'parse') value = JSON.parse(Buffer.from(workerData.input).toString('utf8'));
  else if (workerData.operation === 'tts') value = require('../domain/studio-tts-pack').validatePack(workerData.input);
  else if (workerData.operation === 'swiss') {
    const { tournament, participants, matches, round, bye } = workerData.input;
    value = require('../domain/tournaments/swiss').buildSwissNextRound(tournament, participants, matches, round, Math.random, bye);
  }
  else if (workerData.operation === 'studio') {
    const model = require('../../public/studio/model');
    value = model.validate(model.migrate(workerData.input));
  } else throw Error('Unknown worker operation');
  parentPort.postMessage({ value });
} catch (error) { parentPort.postMessage({ error: error.message, status: error.status || 400 }); }
