import { Module } from '@nestjs/common'
import { ChatsController } from './chats.controller'
import { ChatsService } from './chats.service'
import { PrismaModule } from '~/prisma/prisma.module'
import { RedisModule } from '@/redis/redis.module'
import { MicroModule } from '@/common/abstract/micro/micro.module'
import { ChatsMicroController } from './chats.micro.controller'
import { ChatsMicroService } from './chats.micro.service'

@Module({
    imports: [PrismaModule, RedisModule, MicroModule],
    controllers: [ChatsController, ChatsMicroController],
    providers: [ChatsService, ChatsMicroService],
    exports: [ChatsService, ChatsMicroService]
})
export class ChatsModule {}
