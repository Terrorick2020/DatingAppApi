import { IsString, IsNotEmpty, IsNumber } from 'class-validator'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import type { ChatsToUser } from '@/chats/chats.types'

export class AddChatMicroDto extends ConnectionDto {
    @IsString()
    chatId!: string

    @IsNotEmpty()
    toUser!: ChatsToUser

    @IsString()
    lastMsg!: string 

    @IsNumber()
    created_at!: number

    @IsNumber()
    unread_count!: number
}
