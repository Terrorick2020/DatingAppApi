export const FindAllChatsUserFields = {
    telegramId: true,
    name: true,
    age: true,
    photos: {
        take: 1,
        orderBy: { id: 'asc' as const },
        select: {
            key: true,
            tempTgId: true,
            telegramId: true,
        },
    },
}
