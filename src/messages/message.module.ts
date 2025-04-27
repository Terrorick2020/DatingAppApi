import { Module } from '@nestjs/common'
import { PrismaModule } from '~/prisma/prisma.module'
import { RedisModule } from '@/redis/redis.module'
import { MicroModule } from '@/common/abstract/micro/micro.module'
import { MessagesController } from './messages.controller'
import { MessegesService } from './messages.service'
import { MessagesMicroController } from './messages.micro.controller'
import { MessagesMicroService } from './messages.micro.service'

@Module({
    imports: [PrismaModule, RedisModule, MicroModule],
    controllers: [MessagesController, MessagesMicroController],
    providers: [MessegesService, MessagesMicroService],
    exports: [MessegesService, MessagesMicroService]
})
export class MessagesModule {}
