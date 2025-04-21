import { IsString } from 'class-validator'

export class FindDto {
    @IsString()
    telegramId!: string
}
