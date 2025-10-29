import { Module } from '@nestjs/common'
import { PrismaService } from '~/prisma/prisma.service'
import { AdminOnlyGuard } from '../common/guards/admin-only.guard'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module'
import { RedisModule } from '../redis/redis.module'
import { StorageService } from '../storage/storage.service'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

@Module({
	controllers: [AdminController],
	providers: [
		AdminService,
		PrismaService,
		AppLogger,
		StorageService,
		AdminOnlyGuard,
	],
	imports: [RedisPubSubModule, RedisModule],
})
export class AdminModule {}
