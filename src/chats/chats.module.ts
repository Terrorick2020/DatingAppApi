import { Module } from '@nestjs/common'
import { ChatsController } from './chats.controller'
import { ChatsService } from './chats.service'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '@/redis/redis.service'
import { ChatsMicroserviceController } from './chats.micro.controller'
import { ChatsMicroserviceService } from './chats.micro.service'

@Module({
    controllers: [ ChatsController, ChatsMicroserviceController ],
    providers: [
        PrismaService,
        RedisService,
        ChatsService,
        ChatsMicroserviceService,
    ],
})
export class ChatsModule {}
