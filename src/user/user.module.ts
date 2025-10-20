import { RedisModule } from '@nestjs-modules/ioredis'
import { Module } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubService } from '../common/redis-pub-sub/redis-pub-sub.service'
import { RedisErrorHandler } from '../redis/redis.error-handler'
import { RedisService } from '../redis/redis.service'
import { StorageService } from '../storage/storage.service'
import { UserStatusController } from './user-status.controller'
import { UserStatusService } from './user-status.service'
import { UserController } from './user.controller'
import { UserService } from './user.service'

@Module({
	imports: [RedisModule],
	controllers: [UserController, UserStatusController],
	providers: [
		UserService,
		UserStatusService,
		PrismaService,
		StorageService,
		AppLogger,
		RedisService,
		RedisErrorHandler,
		RedisPubSubService,
	],
	exports: [UserService, UserStatusService],
})
export class UserModule {}
