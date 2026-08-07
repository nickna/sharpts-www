export interface MessageValues {
    [name: string]: string | number;
}

function placeholderNames(template: string): string[] {
    const names: string[] = [];
    const pattern = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
    while (true) {
        const match = pattern.exec(template);
        if (match === null)
            break;
        if (names.indexOf(match[1]) < 0)
            names.push(match[1]);
    }
    const remainder = template.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '');
    if (remainder.indexOf('{') >= 0 || remainder.indexOf('}') >= 0)
        throw new Error('Invalid message placeholder syntax.');
    return names;
}

export function messagePlaceholders(template: string): string[] {
    return placeholderNames(template).sort();
}

export function formatMessage(template: string, values: MessageValues): string {
    const required = placeholderNames(template);
    for (const name of required) {
        if (values[name] === undefined)
            throw new Error('Missing message value {' + name + '}.');
    }
    for (const name of Object.keys(values)) {
        if (required.indexOf(name) < 0)
            throw new Error('Unexpected message value {' + name + '}.');
    }
    return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g,
        (_match: string, name: string): string => String(values[name]));
}
