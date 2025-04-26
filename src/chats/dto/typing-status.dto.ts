import { IsString, IsNotEmpty, IsBoolean } from 'class-validator'

export class TypingStatusDto {
    @IsString()
    @IsNotEmpty()
    chatId!: string

    @IsString()
    @IsNotEmpty()
    userId!: string

    @IsBoolean()
    @IsNotEmpty()
    isTyping!: boolean
}