import { IsString, IsNotEmpty } from 'class-validator'

export class DeleteChatDto {
    @IsString()
    @IsNotEmpty()
    chatId!: string
}