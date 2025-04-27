import { Injectable } from '@nestjs/common'
import { AppLogger } from '@/common/logger/logger.service'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '@/redis/redis.service'
import { MicroService } from '@/common/abstract/micro/micro.service'
import { UpdateChatMicroDto } from './dto/update-chat.micro.dto'
import { AddChatMicroDto } from './dto/add-chat.micro.dto'
import { DeleteChatMicroDto } from './dto/delete-chat.micro.dto'
import { SendChatsTcpPatterns } from './chats.types'

@Injectable()
export class ChatsMicroService extends MicroService {
    constructor(
        protected readonly appLoger: AppLogger,
        protected readonly prismaService: PrismaService,
        protected readonly redisService: RedisService,
        protected readonly configService: ConfigService,
    ) {
        super(appLoger, configService, prismaService, redisService)
    }

    async sendUpdatedChat(updateChatMicroDto: UpdateChatMicroDto): Promise<void> {
        this.sendRequest<SendChatsTcpPatterns, UpdateChatMicroDto>(
            SendChatsTcpPatterns.UpdatedChat,
            updateChatMicroDto,
            `Обновление чата: ${updateChatMicroDto.chatId} для пользователя: ${updateChatMicroDto.telegramId}`
        )
    }

    async sendAddedChat(addChatMicroDto: AddChatMicroDto): Promise<void> {
        this.sendRequest<SendChatsTcpPatterns, AddChatMicroDto>(
            SendChatsTcpPatterns.AddChat,
            addChatMicroDto,
            `Добавление чата: ${addChatMicroDto.chatId} для пользователя: ${addChatMicroDto.telegramId}`
        )
    }

    async sendDeletedChat(deleteChatMicroDto: DeleteChatMicroDto): Promise<void> {
        this.sendRequest<SendChatsTcpPatterns, DeleteChatMicroDto>(
            SendChatsTcpPatterns.DeleteChat,
            deleteChatMicroDto,
            `Удаление чата: ${deleteChatMicroDto.chatId} для пользователя: ${deleteChatMicroDto.telegramId}`
        )
    }
}
