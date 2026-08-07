import { initializeDocs } from './docs';

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => initializeDocs(), { once: true });
else
    initializeDocs();
