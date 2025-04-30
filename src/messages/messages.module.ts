// src/messages/messages.module.ts
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { PrismaModule } from '~/prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'
import { StorageService } from '../storage/storage.service'
import { AppLogger } from '../common/logger/logger.service'
import { MessagesController } from './messages.controller'
import { MessagesMicroController } from './messages.micro.controller'
import { MessegesService } from './messages.service'
import { MessagesMicroService } from './messages.micro.service'

@Module({
	imports: [
		PrismaModule,
		RedisModule,
		ClientsModule.registerAsync([
			{
				name: 'MESSAGES_SERVICE',
				imports: [ConfigModule],
				inject: [ConfigService],
				useFactory: (configService: ConfigService) => ({
					transport: Transport.TCP,
					options: {
						host: configService.get('microservices.messages.host'),
						port: configService.get('microservices.messages.port'),
					},
				}),
			},
		]),
	],
	controllers: [MessagesController, MessagesMicroController],
	providers: [MessegesService, MessagesMicroService, StorageService, AppLogger],
	exports: [MessegesService, MessagesMicroService],
})
export class MessagesModule {}
