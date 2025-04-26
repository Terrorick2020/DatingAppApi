import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class CheckAuthDto {
    @ApiProperty({
        description: 'Telegram ID пользователя',
        example: '123456789'
    })
    @IsString()
    @IsNotEmpty()
    telegramId: string;
}