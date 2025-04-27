import { IsString } from 'class-validator'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'

export class DeleteChatMicroDto extends ConnectionDto {
    @IsString()
    chatId!:string
}
