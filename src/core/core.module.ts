import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from '~/prisma/prisma.module'
import { LoggerModule } from '../common/logger/logger.module'

@Global()
@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
		}),
		PrismaModule,
		LoggerModule,
	],
	exports: [ConfigModule, PrismaModule, LoggerModule],
})
export class CoreModule {}
