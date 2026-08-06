import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-bash';

import { initializeSite } from './bootstrap';

export { initializeSite } from './bootstrap';

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => { void initializeSite(); }, { once: true });
else
    void initializeSite();
