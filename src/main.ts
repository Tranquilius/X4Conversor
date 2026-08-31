import { mountApp } from './ui/app-shell';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Element #app not found in index.html.');
}
mountApp(root);
