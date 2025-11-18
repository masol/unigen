

export async function delay(mstimer: number): Promise<void> {
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve(true);
        }, mstimer);
    })
}