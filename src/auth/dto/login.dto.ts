import { ApiProperty } from '@nestjs/swagger'
import { IsString, IsNotEmpty } from 'class-validator'

export class LoginDto {
    @ApiProperty({
        description: 'Telegram ID пользователя',
        example: '123456789'
    })
    @IsString()
    @IsNotEmpty()
    telegramId: string
}