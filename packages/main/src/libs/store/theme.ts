import { errString, throwUnprcessable } from "$libs/utils/err.js";
import { themeFile } from "$libs/utils/sys/dir.js";
import { GetThemeType } from "$types/shared/api/theme.js";
import Logger from "electron-log/main.js";
import { readFile, rm, writeFile } from "fs/promises";
import pMap from "p-map";


// 设置monaco编辑器的主题--
export async function setTheme(content: string): Promise<string> {
    try {
        const json: Record<string, unknown> = JSON.parse(content);
        if (json.type === 'dark') {
            const fileName = themeFile('dark.json');
            await writeFile(fileName, content);
            Logger.info(`设置深色主题,保存到文件${fileName}`)
            return 'dark';
        } else if (json.type === 'light') {
            const fileName = themeFile('light.json');
            await writeFile(fileName, content);
            Logger.info(`设置浅色主题,保存到文件${fileName}`)
            return 'light';
        } else {
            throwUnprcessable("无效的主题文件,未包含type:dark|light.")
        }
    } catch (e) {
        throwUnprcessable(`设置编辑主题失败:${errString(e)}`)
    }
}

export async function resetTheme() {
    await pMap(
        ['dark', 'light'],
        async (name) => {
            try {
                const fileName = themeFile(`${name}.json`);
                await rm(fileName);
            } catch (_e) {
                return null;
            }
        }
    )
}


export async function getTheme(): Promise<GetThemeType> {
    try {
        const [dark, light] = await pMap(
            ['dark', 'light'],
            async (name) => {
                try {
                    const fileName = themeFile(`${name}.json`);
                    const content = await readFile(fileName, 'utf-8');
                    return content;
                    // const JSON.parse(content);
                    // if(await pathExists(fileName))
                } catch (_e) {
                    return null;
                }
            }
        )
        return { dark, light }
    } catch (e) {
        throwUnprcessable(`设置编辑主题失败:${errString(e)}`)
    }
}