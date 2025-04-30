import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { PrismaModule } from '~/prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'
import { LikeController } from './like.controller'
import { LikeMicroController } from './like.micro.controller'
import { LikeService } from './like.service'
import { LikeMicroService } from './like.micro.service'
import { AppLogger } from '../common/logger/logger.service'
import { UserModule } from '../user/user.module'
import { ChatsModule } from '../chats/chats.module'

@Module({
	imports: [
		PrismaModule,
		RedisModule,
		UserModule,
		ChatsModule,
		ClientsModule.registerAsync([
			{
				name: 'LIKE_SERVICE',
				imports: [ConfigModule],
				inject: [ConfigService],
				useFactory: (configService: ConfigService) => ({
					transport: Transport.TCP,
					options: {
						host: configService.get('microservices.like.host'),
						port: configService.get('microservices.like.port'),
					},
				}),
			},
		]),
	],
	controllers: [LikeController, LikeMicroController],
	providers: [LikeService, LikeMicroService, AppLogger],
	exports: [LikeService, LikeMicroService],
})
export class LikeModule {}
