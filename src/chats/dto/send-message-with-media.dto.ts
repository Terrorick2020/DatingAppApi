import { IsString, IsNotEmpty } from 'class-validator'

export class SendMessageWithMediaDto {
    @IsString()
    @IsNotEmpty()
    chatId!: string

    @IsString()
    @IsNotEmpty()
    fromUser!: string

    @IsString()
    text!: string

    @IsString()
    @IsNotEmpty()
    media_type!: string

    @IsString()
    @IsNotEmpty()
    media_url!: string
}