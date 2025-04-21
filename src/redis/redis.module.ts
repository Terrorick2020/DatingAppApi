import { Module, Global } from '@nestjs/common'
import Redis from 'ioredis'

@Global()
@Module({
	providers: [
		{
			provide: 'REDIS_CLIENT',
			useFactory: () => {
				return new Redis({
					host: process.env.REDIS_HOST || 'redis',
					port: Number(process.env.REDIS_PORT) || 6379,
					password: process.env.REDIS_PASSWORD,
				})
			},
		},
	],
	exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
