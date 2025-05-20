import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from '~/prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'
import { LikeController } from './like.controller'
import { LikeMicroController } from './like.micro.controller'
import { LikeService } from './like.service'
import { AppLogger } from '../common/logger/logger.service'
import { UserModule } from '../user/user.module'
import { ChatsModule } from '../chats/chats.module'
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module'

@Module({
	imports: [
		PrismaModule,
		RedisModule,
		RedisPubSubModule,
		UserModule,
		ChatsModule,
		ConfigModule,
	],
	controllers: [LikeController, LikeMicroController],
	providers: [LikeService, AppLogger],
	exports: [LikeService],
})
export class LikeModule {}
