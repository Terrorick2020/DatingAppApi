import { IsString } from 'class-validator'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'

export class DeleteChatDto extends ConnectionDto {
    @IsString()
    chatId!:string
}
