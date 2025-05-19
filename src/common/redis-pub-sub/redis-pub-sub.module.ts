import { Module, Global } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { RedisPubSubService } from './redis-pub-sub.service'
import { AppLogger } from '../logger/logger.service'

@Global()
@Module({
	imports: [ConfigModule],
	providers: [RedisPubSubService, AppLogger],
	exports: [RedisPubSubService],
})
export class RedisPubSubModule {}
