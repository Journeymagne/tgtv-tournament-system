const api = require('./tierlists');
const MAX_BODY = 32768;
module.exports = [
  { method: 'GET', path: '/api/tierlists/catalog', handler: api.catalog },
  { method: 'GET', path: '/api/tierlists/seasons', handler: api.seasons },
  { method: 'GET', path: '/api/tierlists', auth: 'user', handler: api.list },
  { method: 'GET', path: '/api/tierlists/:id', auth: 'user', handler: api.get },
  { method: 'POST', path: '/api/tierlists', auth: 'user', tx: true, maxBodyBytes: MAX_BODY, handler: api.create },
  { method: 'PATCH', path: '/api/tierlists/:id', auth: 'user', tx: true, maxBodyBytes: MAX_BODY, handler: api.update },
  { method: 'DELETE', path: '/api/tierlists/:id', auth: 'user', tx: true, maxBodyBytes: 1024, handler: api.remove }
];
