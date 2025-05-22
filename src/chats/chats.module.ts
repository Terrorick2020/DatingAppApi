import { Module } from '@nestjs/common'
import { ChatsController } from './chats.controller'
import { ChatsService } from './chats.service'
import { RedisModule } from '../redis/redis.module'
import { PrismaModule } from '~/prisma/prisma.module'
import { StorageService } from '../storage/storage.service'
import { AppLogger } from '../common/logger/logger.service'
import { ChatsMicroController } from './chats.micro.controller'
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module'
import { LoggerModule } from '../common/logger/logger.module'

@Module({
	imports: [PrismaModule, RedisModule, RedisPubSubModule, LoggerModule],
	controllers: [ChatsController, ChatsMicroController],
	providers: [ChatsService, StorageService, AppLogger],
	exports: [ChatsService],
})
export class ChatsModule {}
