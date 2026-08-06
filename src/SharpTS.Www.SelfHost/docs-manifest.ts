export type DocumentationSection = 'Getting Started';

export interface DocumentationArticle {
    slug: string;
    section: DocumentationSection;
    title: string;
    description: string;
    order: number;
    published: boolean;
}

export const documentationManifest: DocumentationArticle[] = [
    {
        slug: 'index',
        section: 'Getting Started',
        title: 'Start using SharpTS',
        description: 'Install SharpTS, run a TypeScript program, and compile it to .NET IL in five minutes.',
        order: 0,
        published: true
    },
    {
        slug: 'getting-started/installation',
        section: 'Getting Started',
        title: 'Installation',
        description: 'Install SharpTS as a .NET global tool or use a self-contained release.',
        order: 1,
        published: true
    },
    {
        slug: 'getting-started/cli-basics',
        section: 'Getting Started',
        title: 'CLI basics',
        description: 'Choose between the REPL, interpreter, compiler, and project checking commands.',
        order: 2,
        published: true
    },
    {
        slug: 'getting-started/web-projects',
        section: 'Getting Started',
        title: 'SharpTS for TypeScript web projects',
        description: 'Use SharpTS as a native companion to an existing browser toolchain.',
        order: 3,
        published: false
    },
    {
        slug: 'getting-started/scripting',
        section: 'Getting Started',
        title: 'Scripting with SharpTS',
        description: 'Run portable TypeScript scripts directly from a shell.',
        order: 4,
        published: false
    }
];

export function validateDocumentationManifest(manifest: DocumentationArticle[]): void {
    const slugs: { [slug: string]: boolean } = {};
    const positions: { [position: string]: boolean } = {};
    for (const article of manifest) {
        if (!/^(index|[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)$/.test(article.slug))
            throw new Error('Invalid documentation slug: ' + article.slug);
        if (slugs[article.slug])
            throw new Error('Duplicate documentation slug: ' + article.slug);
        slugs[article.slug] = true;
        if (!article.title.trim() || !article.description.trim())
            throw new Error('Documentation metadata is incomplete for ' + article.slug);
        if (!Number.isInteger(article.order) || article.order < 0)
            throw new Error('Invalid documentation order for ' + article.slug);
        const position = article.section + ':' + article.order;
        if (positions[position])
            throw new Error('Duplicate documentation order: ' + position);
        positions[position] = true;
    }
    if (!slugs.index)
        throw new Error('Documentation manifest must contain the index article');
}

export function publishedDocumentation(
    manifest: DocumentationArticle[] = documentationManifest
): DocumentationArticle[] {
    validateDocumentationManifest(manifest);
    return manifest.filter(article => article.published).slice().sort((left, right) => left.order - right.order);
}
