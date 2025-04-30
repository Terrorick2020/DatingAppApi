import { Controller } from '@nestjs/common'
import { MicroController } from '@/common/abstract/micro/micro.controller'
import { MessagesMicroService } from './messages.micro.service'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { UpdateMicroPartnerDto } from './dto/update-partner.micro.dto'
import { SendMsgsTcpPatterns } from './messages.type'

@Controller()
export class MessagesMicroController extends MicroController<MessagesMicroService> {
    constructor(protected readonly mesagesMicroService: MessagesMicroService) {
        super(mesagesMicroService)
    }

    @MessagePattern(SendMsgsTcpPatterns.UpdatePartner)
    async updateWritingStatus (@Payload() updatePartnerDto: UpdateMicroPartnerDto ): Promise<void> {
        // дописать логику изменения стату печатает... в redis!!!
        await this.mesagesMicroService.sendUpdatePartner(updatePartnerDto)
    }
}
