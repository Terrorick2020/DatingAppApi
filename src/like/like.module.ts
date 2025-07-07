import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from '~/prisma/prisma.module'
import { ChatsModule } from '../chats/chats.module'
import { LoggerModule } from '../common/logger/logger.module'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module'
import { RedisModule } from '../redis/redis.module'
import { StorageService } from '../storage/storage.service'
import { UserModule } from '../user/user.module'
import { ExpiredMatchesService } from './expired-matches.service'
import { LikeController } from './like.controller'
import { LikeMicroController } from './like.micro.controller'
import { LikeService } from './like.service'

@Module({
	imports: [
		PrismaModule,
		RedisModule,
		RedisPubSubModule,
		UserModule,
		ChatsModule,
		ConfigModule,
		LoggerModule,
	],
	controllers: [LikeController, LikeMicroController],
	providers: [LikeService, ExpiredMatchesService, AppLogger, StorageService],
	exports: [LikeService, ExpiredMatchesService],
})
export class LikeModule {}
