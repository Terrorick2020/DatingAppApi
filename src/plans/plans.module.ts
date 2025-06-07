import { Module } from '@nestjs/common'
import { PlansController } from './plans.controller'
import { PlansService } from './plans.service'
import { HelpersService } from '@/helpers/helpers.service'
import { PrismaService } from '~/prisma/prisma.service'
import { AppLogger } from '@/common/logger/logger.service'


@Module({
    controllers: [PlansController],
    providers: [
        PlansService,
        HelpersService,
        PrismaService,
        AppLogger
    ],
})
export class PlansModule {}
