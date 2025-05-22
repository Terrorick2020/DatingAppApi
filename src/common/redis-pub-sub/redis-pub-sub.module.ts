import { Module, Global, forwardRef } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { RedisPubSubService } from './redis-pub-sub.service'
import { RedisPubSubSubscriber } from './redis-pub-sub.subscriber'
import { WebsocketModule } from '../../websocket/websocket.module'
import { LoggerModule } from '../logger/logger.module'

@Global()
@Module({
	imports: [ConfigModule, forwardRef(() => WebsocketModule), LoggerModule],
	providers: [RedisPubSubService, RedisPubSubSubscriber],
	exports: [RedisPubSubService, RedisPubSubSubscriber],
})
export class RedisPubSubModule {}
