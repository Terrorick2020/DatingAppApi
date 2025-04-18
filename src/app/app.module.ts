import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from '../auth/auth.module'
import { UserModule } from '../user/user.module'
import { BillingModule } from '../billing/billing.module'
import { GeoModule } from '../geo/geo.module'
import { MatchModule } from '../match/match.module'
import { AdminModule } from '../admin/admin.module'
import { AppLogger } from '../common/logger/logger.service'

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		AuthModule,
		UserModule,
		BillingModule,
		GeoModule,
		MatchModule,
		AdminModule,
	],
	controllers: [AppController],
	providers: [AppService, AppLogger],
	exports: [AppLogger],
})
export class AppModule {}
