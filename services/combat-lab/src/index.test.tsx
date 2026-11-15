export {};

jest.mock('react-dom', () => ({
  __esModule: true,
  default: { render: jest.fn(), hydrate: jest.fn() },
}));
jest.mock('src/App', () => ({ __esModule: true, default: () => null }));

function boot() {
  let dom: typeof import('react-dom');
  jest.isolateModules(() => {
    dom = require('react-dom').default;
    require('./index');
  });
  return dom!;
}

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
});

it.each([
  '/?view=fight&fa=12%3A4%3A3%3A3%3A4%3AX%3A0%3A0%3A0%3A0%3A0%3A%3A%3A0',
  '/fight?fa=12%3A4%3A3%3A3%3A4%3AX%3A0%3A0%3A0%3A0%3A0%3A%3A%3A0',
  '/?view=shoot&a1=4%3A3%3A0%3A0%3A0%3A0%3A0%3AX%3A0%3A0%3A0%3A0%3A0%3A',
])('replaces the default snapshot for shared URL %s', (url) => {
  document.body.innerHTML = '<div id="root"><div>Default Shoot snapshot</div></div>';
  window.history.replaceState({}, '', url);
  const ReactDOM = boot();
  expect(ReactDOM.render).toHaveBeenCalledTimes(1);
  expect(ReactDOM.hydrate).not.toHaveBeenCalled();
});

it.each(['/', '/fight'])('hydrates a snapshot when %s has no query parameters', (url) => {
  document.body.innerHTML = '<div id="root"><div>Snapshot</div></div>';
  window.history.replaceState({}, '', url);
  const ReactDOM = boot();
  expect(ReactDOM.hydrate).toHaveBeenCalledTimes(1);
  expect(ReactDOM.render).not.toHaveBeenCalled();
});

it('renders normally when no snapshot is present', () => {
  document.body.innerHTML = '<div id="root"></div>';
  const ReactDOM = boot();
  expect(ReactDOM.render).toHaveBeenCalledTimes(1);
  expect(ReactDOM.hydrate).not.toHaveBeenCalled();
});
