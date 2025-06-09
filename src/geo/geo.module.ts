import { Module } from '@nestjs/common'
import { GeoService } from './geo.service'
import { PrismaService } from '~/prisma/prisma.service'
import { GeoController } from './geo.controller'

@Module({
	controllers: [GeoController],
	providers: [GeoService, PrismaService],
	exports: [GeoService],	
})
export class GeoModule {}
