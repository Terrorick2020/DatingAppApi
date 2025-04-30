import { Module } from '@nestjs/common'
import { ChatsController } from './chats.controller'
import { ChatsService } from './chats.service'
import { RedisModule } from '../redis/redis.module'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { PrismaModule } from '~/prisma/prisma.module'
import { StorageService } from '../storage/storage.service'
import { AppLogger } from '../common/logger/logger.service'

@Module({
	imports: [
		PrismaModule,
		RedisModule,
		ClientsModule.registerAsync([
			{
				name: 'CHATS_SERVICE',
				imports: [ConfigModule],
				inject: [ConfigService],
				useFactory: (configService: ConfigService) => ({
					transport: Transport.TCP,
					options: {
						host: configService.get('microservices.chats.host'),
						port: configService.get('microservices.chats.port'),
					},
				}),
			},
		]),
	],
	controllers: [ChatsController],
	providers: [ChatsService, StorageService, AppLogger],
	exports: [ChatsService],
})
export class ChatsModule {}
