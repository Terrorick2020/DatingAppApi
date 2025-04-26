import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '../redis/redis.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { UpdateDto } from './dto/update.dto'
import { ArkErrors } from 'arktype'
import { v4 } from 'uuid'
import { successResponse, errorResponse } from '@/common/helpers/api.response.helper'
import { FindAllChatsUserFields } from '~/prisma/selects/chats.selects'
import { GetKeyType } from '@/redis/redis.types'
import type { ResUpdatedChat, ResCreateChat, ResFindAllChats } from './chats.types'
import type { ApiResponse } from '@/common/interfaces/api-response.interface'
import {
    ChatSchema,
    UserChatSchema,
    ChatMsgSchema,
    type Chat,
    type UserChat,
    type ChatMsg
} from './chats.types'

@Injectable()
export class ChatsService {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly redisService: RedisService,
    ) {}
    
    async getChat(key: string): Promise<ApiResponse<UserChat>> {
        const userChat = await this.redisService.getKey(key)

        if ( !userChat.success || !userChat.data ) {
            return userChat
        }

        const userChatData: UserChat = JSON.parse(userChat.meta)

        if(UserChatSchema(userChatData)  instanceof ArkErrors) {
            return errorResponse('Ошибка получения списка чатов')
        }

        return successResponse<UserChat>(userChatData, 'Ошибка получения списка чатов')
    }

    async getUserChat(key: string): Promise<ApiResponse<Chat>> {
        const chat = await this.redisService.getKey(key)

        if( !chat.success || !chat.data ) {
            return chat
        }

        const chatData: Chat = JSON.parse(chat.meta)

        if(ChatSchema(chatData)  instanceof ArkErrors) {
            return errorResponse('Ошибка получения списка чатов')
        }

        return successResponse<Chat>(chatData, 'Ошибка получения списка чатов')
    }

    async getMsgsChat(key: string): Promise<ApiResponse<ChatMsg[]>>  {
        const msgsChat = await this.redisService.getKey(key, GetKeyType.Array)

        if( !msgsChat.success || !msgsChat.data ) {
            return msgsChat
        }

        const msgsChatData: ChatMsg[] = msgsChat.meta.map((item: string) => {
            const parsedItem = JSON.parse(item);
            const validation = ChatMsgSchema(parsedItem);
            return validation instanceof ArkErrors ? null : parsedItem;
        }).filter(Boolean)

        if(!msgsChatData) {
            return errorResponse('Ошибка получения списка чатов')
        }

        return successResponse<ChatMsg[]>(msgsChatData, 'Ошибка получения списка чатов')
    }

    async findAll(findDto: FindDto): Promise<ResFindAllChats[] | ApiResponse> {
        const { telegramId } = findDto

        const userChat = await this.getChat(`chat:${telegramId}`)
        const userChatData = userChat.data

        if(!userChat.success || userChatData === undefined) {
            return userChat
        }

        const chat = await this.getUserChat(userChatData.chatId)
        const chatData = chat.data

        if(!chat.success || chatData === undefined) {
            return chat
        }

        const msgsChat = await this.getMsgsChat(`msgs:${chatData.id}`)
        const masgChatData = msgsChat.data

        if(!msgsChat.success || masgChatData === undefined) {
            return msgsChat
        }

        const interlocator = chatData.participants.find(item => item !== telegramId)

        const user = await this.prismaService.user.findUnique({
            where: {
                telegramId: interlocator,
                status: {
                    not: 'Blocked'
                }
            },
            select: FindAllChatsUserFields
        })

        if(!user) {
            return errorResponse('Ошибка получения собеседника')
        }

        const resAllChats = [
            {
                chatId: '',
                toUser: {
                    id: '',
                    avatar: '',
                },
                lastMsg: '',
                created_at: 0,
                unread_count: 0,
            }
        ]

        return resAllChats
    }

    async create(createDto: CreateDto): Promise<ResCreateChat> {
        try {
            const chatId = v4()

            await this.prismaService.chats.create({
                data: {
                    id: chatId,
                    
                }
            })

        } catch {

        }
        

        

        const newChat = {
            id: chatId,
            participants: [createDto.telegramId, createDto.toUser],
            created_at: Date.now(),
            last_message_id: null,
        }

        const newChatUser_1 = {
            chatId: chatId,
            userChat: createDto.telegramId,
            last_read_message_id: null,
        }

        const newChatUser_2 = {
            chatId: chatId,
            userChat: createDto.toUser,
            last_read_message_id: null,
        }

        const newChatMsgs = []

        const resCreateChat = {
            chatId,
            toUser: createDto.toUser,
        }

        return resCreateChat
    }

    async update(chatId: string, updateDto: UpdateDto): Promise<ResUpdatedChat> {

        const updatedChat = {
            id: chatId,
            participants: ['123135', '123435'],
            created_at: Date.now(),
            last_message_id: updateDto.newLastMsgId,
        }

        return updatedChat
    }

    async delete(chatId: string): Promise<typeof successResponse | typeof errorResponse> {
        return successResponse
    }
}
