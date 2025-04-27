export const FindAllChatsUserFields = {
    telegramId: true,
    name: true,
    photos: {
        select: {
            key: true
        },
        take: 1
    }
}
