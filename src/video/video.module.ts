import { Module } from '@nestjs/common'
import { PrismaModule } from '~/prisma/prisma.module'
import { LoggerModule } from '../common/logger/logger.module'
import { RedisModule } from '../redis/redis.module'
import { StorageModule } from '../storage/storage.module'
import { VideoController } from './video.controller'
import { VideoService } from './video.service'

@Module({
	imports: [PrismaModule, StorageModule, RedisModule, LoggerModule],
	controllers: [VideoController],
	providers: [VideoService],
	exports: [VideoService],
})
export class VideoModule {}
