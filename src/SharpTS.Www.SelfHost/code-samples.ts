export const heroCodeBody = `interface Greeter {
    greet(name: string): string;
}

class WelcomeBot implements Greeter {
    constructor(private prefix: string) {}

    greet(name: string): string {
        return \`${'${this.prefix}'}, ${'${name}'}! Welcome to SharpTS.\`;
    }
}

const bot = new WelcomeBot("Hello");
console.log(bot.greet("Developer"));
// → Hello, Developer! Welcome to SharpTS.`;

export const playgroundCodeBody = `interface Person {
    name: string;
    age: number;
}

function greet(person: Person): string {
    return \`Hello, ${'${person.name}'}! You are ${'${person.age}'} years old.\`;
}

const developer: Person = { name: "World", age: 1 };
console.log(greet(developer));`;

export function composeCode(comment: string, body: string): string {
    return comment + '\n' + body;
}
