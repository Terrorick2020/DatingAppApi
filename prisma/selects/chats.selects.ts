export const FindAllChatsUserFields = {
    telegramId: true,
    name: true,
    age: true,
    photos: {
        select: {
            key: true
        },
        take: 1
    }
}
