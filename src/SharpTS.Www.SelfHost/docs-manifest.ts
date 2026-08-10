export const documentationSections = ['Getting Started', 'Compiler Concepts'] as const;

export type DocumentationSection = (typeof documentationSections)[number];

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
        published: true
    },
    {
        slug: 'compiler-concepts/compilation-and-native-aot',
        section: 'Compiler Concepts',
        title: 'Compilation and Native AOT',
        description: 'Follow TypeScript through the SharpTS compiler and understand what Native AOT changes.',
        order: 0,
        published: true
    },
    {
        slug: 'compiler-concepts/tree-shaking',
        section: 'Compiler Concepts',
        title: 'Tree shaking',
        description: 'See how SharpTS removes unreachable code and omits unused runtime features.',
        order: 1,
        published: true
    },
    {
        slug: 'compiler-concepts/performance',
        section: 'Compiler Concepts',
        title: 'Performance',
        description: 'Learn how SharpTS specializes common TypeScript hot paths while preserving JavaScript behavior.',
        order: 2,
        published: true
    },
    {
        slug: 'compiler-concepts/javascript-semantics-on-dotnet',
        section: 'Compiler Concepts',
        title: 'JavaScript Semantics on .NET',
        description: 'See how SharpTS preserves JavaScript values, objects, and operators on the .NET runtime.',
        order: 3,
        published: true
    },
    {
        slug: 'compiler-concepts/functions-closures-and-state-machines',
        section: 'Compiler Concepts',
        title: 'Functions, Closures, and State Machines',
        description: 'Follow calls, captured variables, async functions, and generators through SharpTS lowering.',
        order: 4,
        published: true
    },
    {
        slug: 'compiler-concepts/modules-and-dependency-compilation',
        section: 'Compiler Concepts',
        title: 'Modules and Dependency Compilation',
        description: 'Learn how SharpTS resolves, checks, and emits a TypeScript module graph as one .NET program.',
        order: 5,
        published: true
    }
];

export function validateDocumentationManifest(manifest: DocumentationArticle[]): void {
    const slugs: { [slug: string]: boolean } = {};
    const positions: { [position: string]: boolean } = {};
    for (const article of manifest) {
        if (!(documentationSections as readonly string[]).includes(article.section))
            throw new Error('Unknown documentation section: ' + article.section);
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
    return manifest.filter(article => article.published).slice().sort((left, right) => {
        const sectionOrder = documentationSections.indexOf(left.section) - documentationSections.indexOf(right.section);
        return sectionOrder || left.order - right.order;
    });
}
