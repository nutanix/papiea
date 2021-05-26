import { Diff, Entity_Reference, Version, Provider_Entity_Reference } from "papiea-core"
import { getObjectHash } from "../utils/utils"

// I don't like the provider being necessary here too much, maybe rethink this
// TODO: this structure could be simplified because provider ref is in metadata now
export interface EntryReference {
    provider_reference: {
        provider_prefix: string,
        provider_version: Version
    },
    entity_reference: Entity_Reference
}
const stringifyEntryRef = (r: EntryReference) => [
    r.provider_reference.provider_prefix,
    r.provider_reference.provider_version,
    r.entity_reference.kind,
    r.entity_reference.uuid,
].join('/')

export interface Delay {
    delay_set_time: Date
    delay_seconds: number
}

export interface Backoff {
    delay: Delay
    retries: number
}

export function create_entry(metadata: Provider_Entity_Reference): EntryReference {
    return {
        provider_reference: {
            provider_prefix: metadata.provider_prefix,
            provider_version: metadata.provider_version
        },
        entity_reference: {
            uuid: metadata.uuid,
            kind: metadata.kind
        }
    }
}

export type SerializedWatchlist = {[key: string]: Watch}
export type WatchlistEntries = Watch[]
export type Watch = [EntryReference, [Diff, Backoff | null][]]

export class Watchlist {
    private _entries: SerializedWatchlist
    private _hash: string

    constructor(watchlist?: SerializedWatchlist) {
        this._entries = watchlist ?? {}
        this._hash = getObjectHash(this._entries)
    }

    get(ref: EntryReference): Watch | undefined {
        return this._entries[stringifyEntryRef(ref)]
    }

    set(value: Watch): this {
        this._entries[stringifyEntryRef(value[0])] = value
        return this
    }

    delete(ref: EntryReference): boolean {
        let exists: boolean
        if (this._entries[stringifyEntryRef(ref)]) {
            exists = true
        } else {
            exists = false
        }
        delete this._entries[stringifyEntryRef(ref)]
        return exists
    }

    update(watchlist: Watchlist) {
        this._entries = watchlist._entries
    }

    serialize(): SerializedWatchlist {
        return this._entries
    }

    entries(): SerializedWatchlist {
        return this._entries
    }

    hash(): string {
        return this._hash
    }

    has(ref: EntryReference): boolean {
        const item = this._entries[stringifyEntryRef(ref)]
        return item !== undefined;
    }
}
