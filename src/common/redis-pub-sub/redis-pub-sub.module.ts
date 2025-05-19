import { Module, Global } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { RedisPubSubService } from './redis-pub-sub.service'
import { RedisPubSubSubscriber } from './redis-pub-sub.subscriber'
import { AppLogger } from '../logger/logger.service'
import { WebsocketModule } from '../../websocket/websocket.module'

@Global()
@Module({
	imports: [ConfigModule, WebsocketModule],
	providers: [RedisPubSubService, RedisPubSubSubscriber, AppLogger],
	exports: [RedisPubSubService, RedisPubSubSubscriber],
})
export class RedisPubSubModule {}
