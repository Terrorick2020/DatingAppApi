import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from '~/prisma/prisma.module'
import { LoggerModule } from '../common/logger/logger.module'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module'
import { RedisModule } from '../redis/redis.module'
import { ComplaintController } from './complaint.controller'
import { ComplaintService } from './complaint.service'

@Module({
	imports: [
		PrismaModule,
		RedisModule,
		RedisPubSubModule,
		ConfigModule,
		LoggerModule,
	],
	controllers: [ComplaintController],
	providers: [ComplaintService, AppLogger],
	exports: [ComplaintService],
})
export class ComplaintModule {}
