import { Controller } from '@nestjs/common'
import { MicroController } from '@/common/abstract/micro/micro.controller'
import { MessagesMicroService } from './messages.micro.service'

@Controller()
export class MessagesMicroController extends MicroController<MessagesMicroService> {
    constructor(protected readonly mesagesMicroService: MessagesMicroService) {
        super(mesagesMicroService)
    }
}
