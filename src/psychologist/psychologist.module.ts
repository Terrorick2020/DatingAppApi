import { Module } from '@nestjs/common'
import { PrismaModule } from '~/prisma/prisma.module'
import { LoggerModule } from '../common/logger/logger.module'
import { StorageModule } from '../storage/storage.module'
import { PsychologistController } from './psychologist.controller'
import { PsychologistService } from './psychologist.service'

@Module({
	imports: [PrismaModule, StorageModule, LoggerModule],
	controllers: [PsychologistController],
	providers: [PsychologistService],
	exports: [PsychologistService],
})
export class PsychologistModule {} 