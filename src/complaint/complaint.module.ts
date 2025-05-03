import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ClientsModule, Transport } from '@nestjs/microservices'
import { PrismaModule } from '~/prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'
import { ComplaintController } from './complaint.controller'
import { ComplaintService } from './complaint.service'
import { ComplaintMicroController } from './complaint.micro.controller'
import { ComplaintMicroService } from './complaint.micro.service'
import { AppLogger } from '../common/logger/logger.service'

@Module({
	imports: [
		PrismaModule,
		RedisModule,
		// ClientsModule.registerAsync([
		// 	{
		// 		name: 'COMPLAINT_SERVICE',
		// 		imports: [ConfigModule],
		// 		inject: [ConfigService],
		// 		useFactory: (configService: ConfigService) => ({
		// 			transport: Transport.TCP,
		// 			options: {
		// 				host: configService.get('microservices.complaints.host'),
		// 				port: configService.get('microservices.complaints.port'),
		// 			},
		// 		}),
		// 	},
		// ]),
	],
	controllers: [ComplaintController, ComplaintMicroController],
	providers: [ComplaintService, ComplaintMicroService, AppLogger],
	exports: [ComplaintService, ComplaintMicroService],
})
export class ComplaintModule {}
