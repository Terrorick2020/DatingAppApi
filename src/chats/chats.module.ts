import { Module } from '@nestjs/common'
import { ChatsController } from './chats.controller'
import { ChatsService } from './chats.service'
import { PrismaModule } from '~/prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'

@Module({
    imports: [PrismaModule, RedisModule],
    controllers: [ChatsController],
    providers: [ChatsService],
    exports: [ChatsService]
})
export class ChatsModule {}