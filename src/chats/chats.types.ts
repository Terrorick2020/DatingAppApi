import { type } from 'arktype'

export interface Chat {
    id: string
    participants: string[]
    createdAt: number
    lastMsgId: number | null
}

export interface UserChat {
    chatId: string
    telegramId: string
    lastReadMsgId: number | null
}

export interface ChatMsg {
    id: number
    from: string
    to: string
    visited: boolean
    createdAt: number
    msg: string
}

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

export enum GetChatsPattern {
    JoinChatsRoom = 'joinChatsRoom',
    LeaveChatsRoom = 'leaveChatsRoom',
}

export enum SendChatsPattern {
    JoinChatsRoom = 'joinChatsRoom',
    UpdatedChat = 'UpdatedChat',
    AddChat = 'AddChat',
    DeleteChat = 'DeleteChat',
    LeaveChatsRoom = 'leaveChatsRoom',
}

export const ChatSchema = type({
	id: 'string',
	participants: 'string[]',
	createdAt: 'number',
	lastMsgId: 'number | null',
})
export type ChatInfer = typeof ChatSchema.infer

export const UserChatSchema = type({
	chatId: 'string',
	telegramId: 'string',
	lastReadMsgId: 'number | null',
})
export type UserChatInfer = typeof UserChatSchema.infer

export const ChatMsgSchema = type({
	id: 'number',
	from: 'string',
	to: 'string',
	visited: 'boolean',
	createdAt: 'number',
	msg: 'string'
})
export type ChatMsgInfer = typeof ChatMsgSchema.infer