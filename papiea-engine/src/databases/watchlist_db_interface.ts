import { Watchlist } from "../intentful_engine/watchlist"

export interface Watchlist_DB {
    edit_watchlist<R>(editor: (watchlist: Watchlist) => Promise<R>): Promise<R>
}
