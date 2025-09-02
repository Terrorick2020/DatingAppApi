// Схемы для валидации типов
// export const ChatSchema = type({
//     "id": "string",
//     "participants": ["string", "string"],
//     "created_at": "number",
//     "last_message_id": "string|null",
//     "typing": { "?": "string[]" }  // Опциональное поле со списком пользователей, набирающих текст
// })

// export const UserChatSchema = type({
//     "chatId": "string",
//     "userChat": "string",
//     "last_read_message_id": "string|null"
// })

// export const ChatMsgSchema = type({
//     "id": "string",
//     "chatId": "string",
//     "fromUser": "string",
//     "text": "string",
//     "created_at": "number",
//     "updated_at": "number",
//     "is_read": "boolean",
//     "media_type": { "?": "string" },
//     "media_url": { "?": "string" }
// })

// Интерфейсы типов данных
export interface Chat {
	id: string
	participants: string[]
	created_at: number
	last_message_id: string | null
	last_message_at: number // Timestamp последнего сообщения для сортировки
	typing?: string[] // Список ID пользователей, которые сейчас печатают
}

export interface UserChat {
	chatId: string
	userChat: string
	last_read_message_id: string | null
}

export interface ChatMsg {
	id: string
	chatId: string
	fromUser: string
	text: string
	created_at: number
	updated_at: number
	is_read: boolean
	media_type?: string
	media_url?: string
}

// Типы ответов API
export interface ChatPreview {
	chatId: string
	toUser: {
		id: string
		name: string
		age: number
		avatarKey?: string
		avatarUrl?: string
		interest?: {
			id: number
			value: string
			label: string
		} | null
	}
	lastMsg: string
	created_at: number
	unread_count: number
}

export type ResFindAllChats = ChatPreview

export interface ResCreateChat {
	chatId: string
	toUser: string
}

export type ResUpdatedChat = Chat

export interface ChatsToUser {
	id: string
	avatar: string
	writeStat: EWriteType
}

export enum EWriteType {
	None = 'None',
	Write = 'Write',
}

export enum SendChatsTcpPatterns {
	UpdatedChat = 'UpdatedChat',
	AddChat = 'AddChat',
	DeleteChat = 'DeleteChat',
}

export interface ChatsToUser {
	id: string
	avatar: string
	writeStat: EWriteType
}
