import { IsString, IsNotEmpty } from 'class-validator'

export class SendMessageDto {
    @IsString()
    @IsNotEmpty()
    chatId!: string

    @IsString()
    @IsNotEmpty()
    fromUser!: string

    @IsString()
    @IsNotEmpty()
    text!: string
}