import { initializeConformanceExplorer } from './conformance';

if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => initializeConformanceExplorer(), { once: true });
else
    initializeConformanceExplorer();
