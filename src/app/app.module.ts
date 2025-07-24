import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { AdminModule } from '../admin/admin.module'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { ChatsModule } from '../chats/chats.module'
import { LoggerModule } from '../common/logger/logger.module'
import { AppLogger } from '../common/logger/logger.service'
import { RedisPubSubModule } from '../common/redis-pub-sub/redis-pub-sub.module'
import { ComplaintModule } from '../complaint/complaint.module'
import { CoreModule } from '../core/core.module'
import { GeoModule } from '../geo/geo.module'
import { HelpersModule } from '../helpers/helpers.module'
import { LikeModule } from '../like/like.module'
import { MessagesModule } from '../messages/messages.module'
import { PlansModule } from '../plans/plans.module'
import { PsychologistModule } from '../psychologist/psychologist.module'
import { RedisModule } from '../redis/redis.module'
import { SeedService } from '../seed/seed.service'
import { UserModule } from '../user/user.module'
import { WebsocketModule } from '../websocket/websocket.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

import microservicesConfig from '../config/microservices.config'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [microservicesConfig],
		}),
		CoreModule,
		LoggerModule,
		ChatsModule,
		MessagesModule,
		AuthModule,
		UserModule,
		BillingModule,
		GeoModule,
		AdminModule,
		GeoModule,
		RedisModule,
		LikeModule,
		ComplaintModule,
		HelpersModule,
		PlansModule,
		WebsocketModule,
		RedisPubSubModule,
		PsychologistModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		AppLogger,
		PrismaService,
		SeedService,
	],
	exports: [AppLogger],
})
export class AppModule {}
