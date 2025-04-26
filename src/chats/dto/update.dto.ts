import { IsString, IsNotEmpty } from 'class-validator'

export class UpdateDto {
    @IsString()
    @IsNotEmpty()
    chatId!: string

    @IsString()
    @IsNotEmpty()
    userId!: string
}
