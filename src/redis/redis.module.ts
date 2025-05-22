import { Module, Global } from '@nestjs/common'
import Redis from 'ioredis'
import { RedisController } from './redis.controller'
import { RedisService } from './redis.service'
import { RedisErrorHandler } from './redis.error-handler'
import { PrismaService } from '~/prisma/prisma.service'
import { LoggerModule } from '../common/logger/logger.module'

@Global()
@Module({
	imports: [LoggerModule], 
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
		RedisService,
		RedisErrorHandler,
		PrismaService,
	],
	controllers: [RedisController],
	exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
