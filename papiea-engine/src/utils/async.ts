export type AnyIterable<T> = Iterable<T> | AsyncIterable<T>;

export function isAsyncIterable<T>(i: AnyIterable<T>): i is AsyncIterable<T> {
    return Symbol.asyncIterator in i;
}

export function iter<T>(i: AnyIterable<T>): AsyncIterable<T> {
    if (isAsyncIterable(i)) return i;
    return (async function*() {for await (const v of i) yield v;})();
}

export async function collect<T>(i: AnyIterable<T>): Promise<T[]> {
    if (! isAsyncIterable(i)) return Array.from(i);

    const res = [];
    for await (const v of i) res.push(v);
    return res;
}

export async function* map<T, U>(
    i: AnyIterable<T>, f: (value: T, index: number) => Promise<U>
): AsyncIterable<U> {
    let counter = 0;
    for await (const v of i) {
        yield await f(v, counter);
        ++counter;
    }
}

export async function* filter<T>(
    i: AnyIterable<T>, f: (value: T, index: number) => Promise<boolean>
): AsyncIterable<T> {
    let counter = 0;
    for await (const v of i) {
        if (await f(v, counter)) yield v;
        ++counter;
    }
}
