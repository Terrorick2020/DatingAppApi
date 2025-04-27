import { IsString, IsNotEmpty } from 'class-validator'

export class CreateDto {
    @IsString()
    @IsNotEmpty()
    telegramId!: string

    @IsString()
    @IsNotEmpty()
    toUser!: string
}
