import { Injectable } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { FindDto } from './dto/find.dto'
import { CreateDto } from './dto/create.dto'
import { UpdateDto } from './dto/update.dto'
import { v4 } from 'uuid'
import { successResponse, errorResponse } from '@/common/helpers/api.response.helper'
import type { ResUpdatedChat, ResCreateChat, ResFindAllChats } from './chats.types'

@Injectable()
export class ChatsService {
    constructor( private prisma: PrismaService ) {}

    async findAll(findDto: FindDto): Promise<ResFindAllChats[]> {
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
        const chatId = v4()

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
