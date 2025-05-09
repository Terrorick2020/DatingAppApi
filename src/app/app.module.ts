import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from '../auth/auth.module'
import { UserModule } from '../user/user.module'
import { BillingModule } from '../billing/billing.module'
import { GeoModule } from '../geo/geo.module'
import { AdminModule } from '../admin/admin.module'
import { AppLogger } from '../common/logger/logger.service'
import { RedisModule } from '../redis/redis.module'
import { PrismaService } from '~/prisma/prisma.service'
import microservicesConfig from '../config/microservices.config'
import { ChatsModule } from '../chats/chats.module'
import { MessagesModule } from '../messages/messages.module'
import { LikeModule } from '../like/like.module'
import { ComplaintModule } from '../complaint/complaint.module'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [microservicesConfig],
		}),
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
	],
	controllers: [AppController],
	providers: [AppService, AppLogger, PrismaService],
	exports: [AppLogger],
})
export class AppModule {}
