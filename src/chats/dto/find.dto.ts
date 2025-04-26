import { IsString, IsNotEmpty } from 'class-validator'

export class FindDto {
    @IsString()
    @IsNotEmpty()
    telegramId!: string
}