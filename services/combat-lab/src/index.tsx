import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter } from 'react-router-dom';
import App from 'src/App';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'src/custom.css';
import 'src/companion-tokens.css';
import 'src/companion.css';
import 'src/lab/lab-ui.css';

const rootElement = document.getElementById('root');

const app = (
  <StrictMode>
    <BrowserRouter>
      <App/>
    </BrowserRouter>
  </StrictMode>
);

// react-snap snapshots routes without query parameters. Shared URLs can change
// both the active view and the calculator inputs, so their initial tree does not
// match the snapshot. React 17 hydration may leave mismatched DOM attributes
// (including display:none) unchanged; render these URLs from scratch instead.
if (rootElement?.hasChildNodes() && !window.location.search) {
  ReactDOM.hydrate(app, rootElement);
} else {
  ReactDOM.render(app, rootElement);
}
