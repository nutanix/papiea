import { SessionKeyDb } from "../databases/session_key_db_interface"
import { UserAuthInfo, UserAuthInfoExtractor } from "./authn"
import { SessionKey } from "papiea-core"
import { Provider_DB } from "../databases/provider_db_interface"
import { getOAuth2 } from "./oauth2"

export class SessionKeyAPI {
    private static EXPIRATION_WINDOW_IN_SECONDS = 300
    private readonly sessionKeyDb: SessionKeyDb

    constructor(sessionKeyDb: SessionKeyDb) {
        this.sessionKeyDb = sessionKeyDb
    }

    async createKey(userInfo: UserAuthInfo, token: any, key: string, oauth2: any): Promise<SessionKey> {
        const exp = token.token.expires_at.getTime()
        const sessionKey: SessionKey = {
            key: key,
            expireAt: new Date(exp),
            user_info: userInfo,
            idpToken: token
        }
        await this.sessionKeyDb.create_key(sessionKey)
        if (SessionKeyAPI.isExpired(token)) {
            return await this.refreshKey(sessionKey, oauth2)
        }
        return sessionKey
    }

    async getKey(key: string, oauth2: any): Promise<SessionKey> {
        const sessionKey = await this.sessionKeyDb.get_key(key)
        if (SessionKeyAPI.isExpired(sessionKey.idpToken)) {
            return await this.refreshKey(sessionKey, oauth2)
        } else {
            return sessionKey
        }
    }

    static isExpired(token: any): boolean {
        const exp = token.token.expires_at.getTime()
        const nowInSeconds = (new Date()).getTime();
        const expirationWindowStart = exp - SessionKeyAPI.EXPIRATION_WINDOW_IN_SECONDS;
        return nowInSeconds >= expirationWindowStart;
    }

    async inactivateKey(key: string) {
        return this.sessionKeyDb.inactivate_key(key)
    }

    async refreshKey(sessionKey: SessionKey, oauth2: any): Promise<SessionKey> {
        try {
            const token = {
                access_token: sessionKey.idpToken.token.access_token,
                refresh_token: sessionKey.idpToken.token.refresh_token,
                expires_in: sessionKey.idpToken.token.expires_in
            }
            let accessToken = oauth2.accessToken.create(token);
            accessToken = await accessToken.refresh();
            const exp = accessToken.token.expires_at.getTime()
            await this.sessionKeyDb.update_key(sessionKey.key, {
                idpToken: accessToken,
                expireAt: new Date(exp)
            })
            sessionKey.idpToken = accessToken
            return sessionKey
        } catch (e) {
            throw new Error(`Couldn't refresh the token: ${e.message}`)
        }
    }
}

export class SessionKeyUserAuthInfoExtractor implements UserAuthInfoExtractor {
    private readonly sessionKeyApi: SessionKeyAPI
    private readonly providerDb: Provider_DB

    constructor(sessionKeyApi: SessionKeyAPI, providerDb: Provider_DB) {
        this.sessionKeyApi = sessionKeyApi
        this.providerDb = providerDb
    }

    async getUserAuthInfo(token: string, provider_prefix: string, provider_version: string): Promise<UserAuthInfo | null> {
        try {
            const provider = await this.providerDb.get_provider(provider_prefix, provider_version)
            const oauth2 = getOAuth2(provider);
            const sessionKey = await this.sessionKeyApi.getKey(token, oauth2)
            const user_info = sessionKey.user_info
            delete user_info.is_admin
            return user_info
        } catch (e) {
            console.error(`While trying to authenticate with IDP error: '${ e }' occurred`)
            return null
        }
    }
}