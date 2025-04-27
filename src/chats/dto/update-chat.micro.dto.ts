import { IsString, IsEnum, ValidateIf, IsOptional, IsNumber } from 'class-validator'
import { ConnectionDto } from '@/common/abstract/micro/dto/connection.dto'
import { EWriteType } from '@/chats/chats.types'

export class UpdateChatMicroDto extends ConnectionDto {
    @IsString()
    chatId!: string

    @ValidateIf((o) => o.newWriteStat === undefined)
    @IsString()
    @IsOptional()
    newLastMsgId!: string

    @ValidateIf((o) => o.newLastMsgId === undefined)
    @IsEnum(EWriteType)
    @IsOptional()
    newWriteStat?: EWriteType

    @IsNumber()
    @IsOptional()
    newUnreadCount?: number
}
