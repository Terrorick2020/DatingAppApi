import { Injectable } from '@nestjs/common'
import { AppLogger } from '@/common/logger/logger.service'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '~/prisma/prisma.service'
import { RedisService } from '@/redis/redis.service'
import { MicroService } from '@/common/abstract/micro/micro.service'
import { SendMsgsTcpPatterns } from './messages.type'
import { UpdateMicroPartnerDto } from './dto/update-partner.micro.dto'
import { UpdateMicroMsgDto } from './dto/update-msg.micro.dto'

@Injectable()
export class MessagesMicroService extends MicroService {
    constructor(
        protected readonly appLoger: AppLogger,
        protected readonly prismaService: PrismaService,
        protected readonly redisService: RedisService,
        protected readonly configService: ConfigService,
    ) {
        super(appLoger, configService, prismaService, redisService)
    }

    async sendUpdatePartner(updatePartnerDto: UpdateMicroPartnerDto): Promise<void> {
        this.sendRequest<SendMsgsTcpPatterns, UpdateMicroPartnerDto>(
            SendMsgsTcpPatterns.UpdatePartner,
            updatePartnerDto,
            `Изменение состояния собеседника в комнате: ${updatePartnerDto.roomName} ` +
            `для пользователя: ${updatePartnerDto.telegramId}`
        )
    }

    async sendUpdateMsg(updateMsgDto: UpdateMicroMsgDto): Promise<void> {
        this.sendRequest<SendMsgsTcpPatterns, UpdateMicroMsgDto>(
            SendMsgsTcpPatterns.UpdateMsg,
            updateMsgDto,
            `Изменение сообщения: ${updateMsgDto.msgId} в чате: ${updateMsgDto.chatId}`
        )
    }
}
