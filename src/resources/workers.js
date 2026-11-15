const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { HttpError } = require('../http/io');
const { busy } = require('./admission');
let active = 0;
const max = Math.max(1, Math.min(4, Math.floor(Number(process.env.RESOURCE_WORKERS) || 1)));
function run(operation, input) {
  if (active >= max) return Promise.reject(busy('Обработка файлов занята. Повторите через 2 сек.'));
  active++;
  return new Promise((resolve, reject) => {
    let worker, timer, finished = false;
    const done = (error, value) => {
      if (finished) return; finished = true; clearTimeout(timer);
      const finish = () => { active--; error ? reject(error) : resolve(value); };
      if (worker) worker.terminate().then(finish, finish); else finish();
    };
    try {
      worker = new Worker(path.join(__dirname, 'worker.js'), { workerData: { operation, input }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
      timer = setTimeout(() => done(new HttpError(413, 'Обработка файла превысила допустимое время. Уменьшите проект или изображения.')), 15000);
      worker.once('message', result => {
        if (result.error) return done(new HttpError(result.status, result.error));
        if (operation === 'tts') for (const asset of result.value.assets) asset.bytes = Buffer.from(asset.bytes);
        done(null, result.value);
      });
      worker.once('error', () => done(new HttpError(413, 'Файл требует слишком много ресурсов для обработки.')));
      worker.once('exit', code => { if (!finished) done(new HttpError(503, `Обработка файла прервана (${code}). Повторите попытку.`)); });
    } catch (error) { done(error); }
  });
}
module.exports = { run };
