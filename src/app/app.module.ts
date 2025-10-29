import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { AdminModule } from '../admin/admin.module'
import { AuthModule } from '../auth/auth.module'
import { BillingModule } from '../billing/billing.module'
import { ChatsModule } from '../chats/chats.module'
import { AdminOnlyGuard } from '../common/guards/admin-only.guard'
import { LoggerModule } from '../common/logger/logger.module'
import { AppLogger } from '../common/logger/logger.service'
import { UserActivityMiddleware } from '../common/middleware/user-activity.middleware'
import { SmartCaptchaModule } from '../common/modules/smart-captcha.module'
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
import { VideoModule } from '../video/video.module'
import { WebsocketModule } from '../websocket/websocket.module'
import { AppController } from './app.controller'
import { AppService } from './app.service'

import microservicesConfig from '../config/microservices.config'
import smartCaptchaConfig from '../config/smart-captcha.config'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [microservicesConfig, smartCaptchaConfig],
		}),
		CoreModule,
		LoggerModule,
		SmartCaptchaModule,
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
		VideoModule,
	],
	controllers: [AppController],
	providers: [
		AppService,
		AppLogger,
		PrismaService,
		SeedService,
		UserActivityMiddleware,
		AdminOnlyGuard,
	],
	exports: [AppLogger],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer.apply(UserActivityMiddleware).forRoutes('*')
	}
}
