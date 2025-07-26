import { Module } from '@nestjs/common'
import { PrismaModule } from '~/prisma/prisma.module'
import { RedisModule } from '../redis/redis.module'
import { StorageService } from '../storage/storage.service'
import { PsychologistController } from './psychologist.controller'
import { PsychologistService } from './psychologist.service'

@Module({
	imports: [PrismaModule, RedisModule],
	controllers: [PsychologistController],
	providers: [PsychologistService, StorageService],
	exports: [PsychologistService],
})
export class PsychologistModule {} 