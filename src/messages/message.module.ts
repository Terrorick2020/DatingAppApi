import { Module } from '@nestjs/common'
import { MessagesController } from './messages.controller'
import { MessegesService } from './messages.service'
import { PrismaService } from '~/prisma/prisma.service'

@Module({
    controllers: [ MessagesController ],
    providers: [ MessegesService, PrismaService ],
})
export class MessagesModule {}
