import Logger from "electron-log";

export async function getCountryCode(): Promise<string | null> {
    try {
        const url = `http://ip-api.com/json/`;
        const res = await fetch(url).then(r => r.json());
        return res.status === 'success' ? res.countryCode as string : null;
    } catch (error) {
        Logger.error(`IP 查询失败:${error instanceof Error ? error.message : String(error)}`)
    }
    return null;

}