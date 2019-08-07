import { UserAuthInfo, UserAuthInfoExtractor } from "./authn";
import { S2S_Key_DB } from "../databases/s2skey_db_interface";
import { S2S_Key } from "papiea-core";


export class S2SKeyUserAuthInfoExtractor implements UserAuthInfoExtractor {
    private readonly s2skeyDb: S2S_Key_DB;

    constructor(s2skeyDb: S2S_Key_DB) {
        this.s2skeyDb = s2skeyDb;
    }

    async getUserAuthInfo(token: string, provider_prefix?: string, provider_version?: string): Promise<UserAuthInfo | null> {
        try {
            const s2skey: S2S_Key = await this.s2skeyDb.get_key_by_secret(token);
            const user_info = s2skey.user_info;
            user_info.provider_prefix = s2skey.provider_prefix;
            user_info.authorization = 'Bearer ' + s2skey.key;
            return user_info;
        } catch (e) {
            return null;
        }
    }
}