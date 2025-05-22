import { Global, Module } from '@nestjs/common'
import Redis from 'ioredis'
import { ConfigService } from '@nestjs/config'
import { RedisController } from './redis.controller'
import { RedisService } from './redis.service'
import { RedisErrorHandler } from './redis.error-handler'

@Global()
@Module({
	providers: [
		{
			provide: 'REDIS_CLIENT',
			useFactory: (configService: ConfigService) => {
				return new Redis({
					host: configService.get('REDIS_HOST', 'redis'),
					port: configService.get('REDIS_PORT', 6379),
					password: configService.get('REDIS_PASSWORD'),
				})
			},
			inject: [ConfigService],
		},
		RedisService,
		RedisErrorHandler,
	],
	controllers: [RedisController],
	exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
