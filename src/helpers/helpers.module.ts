import { Module } from '@nestjs/common'
import { HelpersController } from './helpers.controller'
import { HelpersService } from './helpers.service'
import { PrismaService } from '~/prisma/prisma.service'
import { AppLogger } from '@/common/logger/logger.service'

@Module({
    controllers: [HelpersController],
    providers: [HelpersService, PrismaService, AppLogger],
})
export class HelpersModule{}
