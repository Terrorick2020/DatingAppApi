export interface ResFindAllChatsToUser {
    id: string
    avatar: string
}

export interface ResFindAllChats {
    chatId: string
    toUser: ResFindAllChatsToUser
    lastMsg: string
    created_at: number
    unread_count: number
}

export interface ResCreateChat {
    chatId: string
    toUser: string
}

export interface ResUpdatedChat {
    id: string
    participants: string[]
    created_at: number
    last_message_id: string
}