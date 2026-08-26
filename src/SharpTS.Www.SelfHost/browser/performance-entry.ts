import { initializePerformanceExplorer } from './performance';

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => initializePerformanceExplorer(), { once: true });
else
    initializePerformanceExplorer();
