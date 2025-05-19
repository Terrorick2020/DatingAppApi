import { Module, forwardRef } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { WebsocketGateway } from './websocket.gateway'
import { WebSocketService } from './websocket.service'
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module'
import { RedisModule } from '../redis/redis.module'

@Module({
	imports: [ConfigModule, forwardRef(() => RedisPubSubModule), RedisModule],
	providers: [WebsocketGateway, WebSocketService],
	exports: [WebSocketService],
})
export class WebsocketModule {}
