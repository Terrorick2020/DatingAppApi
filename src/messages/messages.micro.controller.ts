import { Controller } from '@nestjs/common'
import { MessagePattern, Payload } from '@nestjs/microservices'
import { MessegesService } from './messages.service'
import { FindDto } from './dto/find.dto'

@Controller()
export class MessagesMicroserviceController {
    constructor( private readonly msgServise: MessegesService ) {}

    @MessagePattern({ cmd: 'get_chat_list' })
    async getChatList(@Payload() dto: FindDto) {
        return await this.msgServise.findAll(dto)
    }

    @MessagePattern({ cmd: 'create_chat' })
    async createChat(@Payload() dto: any) {
        return await this.msgServise.create(dto)
    }
}
