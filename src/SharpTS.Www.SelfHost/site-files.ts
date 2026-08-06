import * as fs from 'fs';
import * as path from 'path';
import { normalizeNewlines } from './site-html';

interface FileStat {
    isDirectory(): boolean;
    isFile(): boolean;
}

export function ensureDirectory(directory: string): void {
    fs.mkdirSync(directory, { recursive: true });
}

export function writeText(filePath: string, value: string): void {
    ensureDirectory(path.dirname(filePath));
    fs.writeFileSync(filePath, normalizeNewlines(value), 'utf8');
}

export function copyTree(source: string, destination: string): void {
    ensureDirectory(destination);
    const entries = (fs.readdirSync(source) as string[]).slice().sort();
    for (const entry of entries) {
        const sourcePath = path.join(source, entry);
        const destinationPath = path.join(destination, entry);
        const stat: FileStat = fs.statSync(sourcePath);
        if (stat.isDirectory())
            copyTree(sourcePath, destinationPath);
        else if (stat.isFile())
            fs.copyFileSync(sourcePath, destinationPath);
    }
}
