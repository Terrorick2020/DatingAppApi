import { Controller } from '@nestjs/common'
import { MicroController } from '@/common/abstract/micro/micro.controller'
import { ChatsMicroService } from './chats.micro.service'

@Controller()
export class ChatsMicroController extends MicroController<ChatsMicroService> {
	constructor(protected readonly chatsMicroService: ChatsMicroService) {
        super(chatsMicroService)
    }
}
